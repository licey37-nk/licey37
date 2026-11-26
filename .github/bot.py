import os
import json
import urllib.request
import urllib.error
import re
import traceback


# ---------- Работа с файлами ----------

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


def find_flexible(haystack, needle):
    """Гибкий поиск needle в haystack с нормализацией пробельных последовательностей."""
    if not needle.strip():
        return None
    idx = haystack.find(needle)
    if idx != -1:
        return (idx, idx + len(needle))
    parts = re.split(r"\s+", needle.strip())
    if not parts:
        return None
    pattern = r"\s+".join(re.escape(p) for p in parts)
    m = re.search(pattern, haystack, re.DOTALL)
    if m:
        return (m.start(), m.end())
    return None


def apply_edit(path, old, new):
    """Применяет точечную замену с гибким поиском пробелов."""
    if not os.path.exists(path):
        return False
    content = read_file(path)
    loc = find_flexible(content, old)
    if loc is None:
        return False
    start, end = loc
    write_file(path, content[:start] + new + content[end:])
    return True


# ---------- HTTP ----------

HEADERS_BASE = {"User-Agent": "Mozilla/5.0"}


def http_post_json(url, api_key, payload):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        method="POST",
        headers={
            **HEADERS_BASE,
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=240) as resp:
        raw = resp.read().decode("utf-8", errors="replace")
    return raw


# ---------- Парсинг XML-тегов ----------

def strip_markdown_fences(text):
    """Убирает возможные markdown-обёртки ```html ... ``` вокруг содержимого."""
    text = re.sub(r"^\s*```[a-zA-Z0-9_-]*\s*\n", "", text)
    text = re.sub(r"\n```\s*$", "", text)
    return text


def extract_tags(text):
    files = []
    edits = []

    for m in re.finditer(r'<FILE\s+path="([^"]+)"\s*>(.*?)</FILE>', text, re.DOTALL):
        path = m.group(1).strip()
        content = strip_markdown_fences(m.group(2))
        files.append((path, content))

    edit_pattern = re.compile(
        r'<EDIT\s+path="([^"]+)"\s*>\s*<OLD>(.*?)</OLD>\s*<NEW>(.*?)</NEW>\s*</EDIT>',
        re.DOTALL,
    )
    for m in edit_pattern.finditer(text):
        edits.append((m.group(1).strip(), m.group(2), m.group(3)))

    return files, edits


def strip_tags(text):
    """Удаляет все теги FILE/EDIT, оставляя прочий текст для отчёта."""
    cleaned = re.sub(r'<FILE\s+path="[^"]+"\s*>.*?</FILE>', '', text, flags=re.DOTALL)
    cleaned = re.sub(
        r'<EDIT\s+path="[^"]+"\s*>\s*<OLD>.*?</OLD>\s*<NEW>.*?</NEW>\s*</EDIT>',
        '',
        cleaned,
        flags=re.DOTALL,
    )
    return cleaned.strip()


# ---------- Промпт ----------

def build_prompt(issue_body, index_html):
    return (
        "Ты — опытный senior-разработчик, который редактирует файлы в GitHub-репозитории.\n"
        "Задача: выполнить запрос пользователя, изменив нужные файлы.\n\n"
        "ВАЖНО: вернуть изменения СТРОГО в XML-тегах. Никаких markdown-обёрток, никаких ``` "
        "вокруг содержимого тегов. Весь текст ВНЕ тегов будет показан пользователю как отчёт.\n\n"
        "Доступные теги:\n"
        '1) Создание или полная перезапись файла:\n'
        '<FILE path="путь/файл">ПОЛНЫЙ КОД ФАЙЛА</FILE>\n\n'
        '2) Точечная замена фрагмента (для небольших правок — предпочтительно):\n'
        '<EDIT path="путь/файл"><OLD>точные старые строки из файла</OLD><NEW>новые строки</NEW></EDIT>\n\n'
        "Правила:\n"
        "- Можно вернуть несколько <FILE> и/или <EDIT> подряд.\n"
        "- В <OLD> вставляй ТОЧНЫЙ фрагмент текущего файла. Пробелы и переносы сопоставляются гибко, "
        "но чем точнее — тем надёжнее.\n"
        "- Большие изменения — через <FILE>, мелкие — через <EDIT>.\n"
        "- Никаких ```html / ```python / ``` вокруг содержимого тегов.\n\n"
        "Текущий index.html (если существует):\n"
        "----- НАЧАЛО index.html -----\n"
        f"{index_html}\n"
        "----- КОНЕЦ index.html -----\n\n"
        "Запрос пользователя:\n"
        f"{issue_body}\n\n"
        "Верни ответ с XML-тегами."
    )


# ---------- Основная логика ----------

MODELS = ["codestral-latest", "mistral-large-latest"]


def call_mistral(api_key, prompt):
    url = "https://api.mistral.ai/v1/chat/completions"
    last_errors = []
    for model_id in MODELS:
        payload = {
            "model": model_id,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.2,
            "max_tokens": 32000,
        }
        try:
            raw = http_post_json(url, api_key, payload)
            parsed = json.loads(raw)
            content = parsed["choices"][0]["message"]["content"]
            return model_id, content
        except urllib.error.HTTPError as e:
            body_err = e.read().decode("utf-8", errors="replace")[:500]
            last_errors.append(f"{model_id} → HTTP {e.code}: {body_err}")
            # 400/404 — пробуем следующую модель; иные ошибки тоже пробуем
            continue
        except Exception as e:
            last_errors.append(f"{model_id} → {type(e).__name__}: {e}")
            continue
    raise RuntimeError("Не удалось получить ответ от Mistral:\n" + "\n".join(last_errors))


def main():
    api_key = os.environ.get("AI_API_KEY", "").strip()
    issue_body = os.environ.get("ISSUE_BODY", "")

    if not api_key:
        raise RuntimeError("Переменная окружения AI_API_KEY не задана")

    index_html = read_file("index.html")
    prompt = build_prompt(issue_body, index_html)

    used_model, model_text = call_mistral(api_key, prompt)

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

    # ---------- Отчёт ----------
    report_parts = [f"🤖 Использована модель Mistral: `{used_model}`"]

    body_text = strip_tags(model_text)
    if body_text:
        report_parts.append("\n" + body_text)

    report_parts.append("\n---")
    if created:
        report_parts.append("**Созданы/перезаписаны файлы:**")
        report_parts.extend(f"- `{p}`" for p in created)
    if modified:
        report_parts.append("**Точечно изменены файлы:**")
        report_parts.extend(f"- `{p}`" for p in modified)
    if failed_edits:
        report_parts.append("**Не удалось применить EDIT (фрагмент не найден):**")
        report_parts.extend(f"- `{p}`" for p in failed_edits)

    if not created and not modified:
        report_parts.append("\n⚠️ Ни один тег `<FILE>` или `<EDIT>` не был применён.")
        report_parts.append("\nПервые 800 символов ответа модели:\n")
        report_parts.append(model_text[:800])

    with open("r.txt", "w", encoding="utf-8") as f:
        f.write("\n".join(report_parts))


if __name__ == "__main__":
    try:
        main()
    except Exception:
        with open("r.txt", "w", encoding="utf-8") as f:
            f.write("❌ Ошибка выполнения бота:\n\n")
            f.write(traceback.format_exc())
