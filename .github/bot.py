import os
import json
import urllib.request
import urllib.error
import re
import traceback


def read_file(path):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return f.read()
    except Exception:
        return ""


def write_file(path, content):
    dir_name = os.path.dirname(path)
    if dir_name:
        os.makedirs(dir_name, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)


def normalize_ws(text):
    """Нормализует пробелы для гибкого поиска: любые последовательности пробельных символов -> один пробел, trim."""
    return re.sub(r"\s+", " ", text).strip()


def find_flexible(haystack, needle):
    """Ищет needle в haystack с гибким сопоставлением пробелов. Возвращает (start, end) в оригинальном haystack или None."""
    if not needle.strip():
        return None
    # Точный поиск сначала
    idx = haystack.find(needle)
    if idx != -1:
        return (idx, idx + len(needle))

    # Гибкий поиск: строим regex из needle, где пробелы -> \s+
    parts = re.split(r"\s+", needle.strip())
    if not parts:
        return None
    pattern = r"\s+".join(re.escape(p) for p in parts)
    # Ищем без учёта регистра? Нет, сохраняем регистр, но пробелы гибкие
    m = re.search(pattern, haystack, re.DOTALL)
    if m:
        return (m.start(), m.end())
    return None


def apply_edit(path, old, new):
    """Применяет точечную замену. Возвращает True при успехе."""
    if not os.path.exists(path):
        return False
    content = read_file(path)
    loc = find_flexible(content, old)
    if loc is None:
        return False
    start, end = loc
    new_content = content[:start] + new + content[end:]
    write_file(path, new_content)
    return True


def extract_tags(text):
    """Извлекает все <FILE ...>...</FILE> и <EDIT ...>...</EDIT>."""
    files = []
    edits = []

    # FILE
    for m in re.finditer(r'<FILE\s+path="([^"]+)"\s*>(.*?)</FILE>', text, re.DOTALL):
        path = m.group(1).strip()
        content = m.group(2)
        # Убираем возможную markdown-обёртку
        content = re.sub(r"^```[a-zA-Z]*\n?", "", content)
        content = re.sub(r"\n?```\s*$", "", content)
        files.append((path, content))

    # EDIT
    edit_pattern = re.compile(
        r'<EDIT\s+path="([^"]+)"\s*>\s*<OLD>(.*?)</OLD>\s*<NEW>(.*?)</NEW>\s*</EDIT>',
        re.DOTALL,
    )
    for m in edit_pattern.finditer(text):
        path = m.group(1).strip()
        old = m.group(2)
        new = m.group(3)
        edits.append((path, old, new))

    return files, edits


def strip_tags(text):
    """Удаляет все теги FILE и EDIT, оставляя только остальной текст для отчёта."""
    cleaned = re.sub(r'<FILE\s+path="[^"]+"\s*>.*?</FILE>', '', text, flags=re.DOTALL)
    cleaned = re.sub(
        r'<EDIT\s+path="[^"]+"\s*>\s*<OLD>.*?</OLD>\s*<NEW>.*?</NEW>\s*</EDIT>',
        '',
        cleaned,
        flags=re.DOTALL,
    )
    return cleaned.strip()


def main():
    api_key = os.environ.get("AI_API_KEY", "")
    issue_body = os.environ.get("ISSUE_BODY", "")

    if not api_key:
        raise RuntimeError("Переменная окружения AI_API_KEY не задана")

    index_html = read_file("index.html")

    prompt = (
        "Ты — опытный разработчик, редактирующий файлы в репозитории GitHub. "
        "Пользователь оставил запрос. Ты должен вернуть изменения СТРОГО в XML-тегах, "
        "без markdown-обёрток и без пояснений вокруг тегов.\n\n"
        "Форматы тегов (используй ТОЛЬКО их):\n"
        '1) Создание или полная перезапись файла:\n'
        '<FILE path="путь/файл">ПОЛНЫЙ КОД ФАЙЛА БЕЗ MARKDOWN-ОБЁРНУТКИ</FILE>\n\n'
        '2) Точечная замена фрагмента:\n'
        '<EDIT path="путь/файл"><OLD>точные старые строки</OLD><NEW>новые строки</NEW></EDIT>\n\n'
        "Правила:\n"
        "- Можно возвращать несколько тегов <FILE> и <EDIT> подряд.\n"
        "- В <OLD> указывай ТОЧНЫЙ фрагмент из текущего файла (пробелы должны совпадать максимально точно, "
        "скрипт умеет гибко сопоставлять пробельные последовательности).\n"
        "- Не оборачивай содержимое тегов в ```.\n"
        "- Любой текст вне тегов попадёт в отчёт пользователю — можешь дать краткое пояснение.\n\n"
        "Текущий index.html (если существует):\n"
        "----- НАЧАЛО index.html -----\n"
        f"{index_html}\n"
        "----- КОНЕЦ index.html -----\n\n"
        "Запрос пользователя:\n"
        f"{issue_body}\n\n"
        "Верни ответ с XML-тегами."
    )

    url = "https://api.zveno.ai/v1/chat/completions"
    payload = {
        "model": "deepseek/deepseek-chat",
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.2,
        "max_tokens": 16000,
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        method="POST",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0",
        },
    )

    with urllib.request.urlopen(req, timeout=120) as resp:
        raw = resp.read().decode("utf-8", errors="replace")

    try:
        parsed = json.loads(raw)
        model_text = parsed["choices"][0]["message"]["content"]
    except Exception as e:
        raise RuntimeError(f"Не удалось разобрать ответ API: {e}\nСырой ответ: {raw[:800]}")

    files, edits = extract_tags(model_text)

    created = []
    modified = []
    failed_edits = []

    for path, content in files:
        write_file(path, content)
        created.append(path)

    for path, old, new in edits:
        if apply_edit(path, old, new):
            modified.append(path)
        else:
            failed_edits.append(path)

    report = strip_tags(model_text)
    report += "\n\n---\n"
    if created:
        report += "**Созданы/перезаписаны файлы:**\n" + "\n".join(f"- `{p}`" for p in created) + "\n"
    if modified:
        report += "**Изменены файлы (точечные правки):**\n" + "\n".join(f"- `{p}`" for p in modified) + "\n"
    if failed_edits:
        report += "**Не удалось применить EDIT (не найден фрагмент):**\n" + "\n".join(f"- `{p}`" for p in failed_edits) + "\n"
    if not created and not modified:
        report += "⚠️ Ни один тег `<FILE>` или `<EDIT>` не был успешно применён.\n\n"
        report += "Первые 800 символов сырого ответа модели:\n\n"
        report += model_text[:800]

    with open("r.txt", "w", encoding="utf-8") as f:
        f.write(report)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        with open("r.txt", "w", encoding="utf-8") as f:
            f.write("❌ Произошла ошибка при выполнении:\n\n")
            f.write(traceback.format_exc())
