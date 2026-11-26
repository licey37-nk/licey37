import os
import json
import urllib.request
import urllib.error
import re
import traceback


# ---------- Утилиты работы с файлами ----------

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
    """Ищет needle в haystack с гибким сопоставлением пробелов/переносов."""
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
    """Применяет точечную замену с гибким поиском. Возвращает True при успехе."""
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


def http_get_json(url, api_key):
    req = urllib.request.Request(
        url,
        method="GET",
        headers={**HEADERS_BASE, "Authorization": f"Bearer {api_key}"},
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        raw = resp.read().decode("utf-8", errors="replace")
    return raw


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
    with urllib.request.urlopen(req, timeout=180) as resp:
        raw = resp.read().decode("utf-8", errors="replace")
    return raw


# ---------- Выбор модели Claude ----------

def parse_models_list(raw):
    """Возвращает список id моделей из ответа /models."""
    try:
        data = json.loads(raw)
    except Exception:
        return []
    ids = []
    if isinstance(data, dict) and isinstance(data.get("data"), list):
        for m in data["data"]:
            if isinstance(m, dict) and m.get("id"):
                ids.append(m["id"])
    elif isinstance(data, list):
        for m in data:
            if isinstance(m, dict) and m.get("id"):
                ids.append(m["id"])
            elif isinstance(m, str):
                ids.append(m)
    return ids


def score_claude_model(model_id):
    """Оценка: чем выше — тем лучше Sonnet. Возвращает None если это не claude-sonnet."""
    low = model_id.lower()
    if "claude" not in low:
        return None
    if "sonnet" not in low:
        return None
    score = 0
    # Предпочитаем версии по убыванию
    version_patterns = [
        (r"claude[-_.]?4", 100),
        (r"claude[-_.]?3[._-]?7", 90),
        (r"claude[-_.]?3[._-]?5", 80),
        (r"claude[-_.]?3[._-]?0", 60),
        (r"claude[-_.]?3", 50),
    ]
    for pat, s in version_patterns:
        if re.search(pat, low):
            score += s
            break
    # Небольшой бонус за "latest"
    if "latest" in low:
        score += 5
    return score


def select_claude_model(available_ids):
    """Возвращает лучшую Sonnet-модель Claude из списка или None."""
    best = None
    best_score = -1
    for mid in available_ids:
        s = score_claude_model(mid)
        if s is not None and s > best_score:
            best = mid
            best_score = s
    return best


# ---------- Парсинг XML-тегов ----------

def extract_tags(text):
    files = []
    edits = []
    for m in re.finditer(r'<FILE\s+path="([^"]+)"\s*>(.*?)</FILE>', text, re.DOTALL):
        path = m.group(1).strip()
        content = m.group(2)
        # убираем возможную markdown-обёртку
        content = re.sub(r"^```[a-zA-Z0-9_-]*\s*\n?", "", content)
        content = re.sub(r"\n?```\s*$", "", content)
        files.append((path, content))

    edit_pattern = re.compile(
        r'<EDIT\s+path="([^"]+)"\s*>\s*<OLD>(.*?)</OLD>\s*<NEW>(.*?)</NEW>\s*</EDIT>',
        re.DOTALL,
    )
    for m in edit_pattern.finditer(text):
        edits.append((m.group(1).strip(), m.group(2), m.group(3)))
    return files, edits


def strip_tags(text):
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
        "Ты — опытный senior-разработчик, который редактирует файлы в репозитории GitHub.\n"
        "Твоя задача — выполнить запрос пользователя, изменив файлы репозитория.\n\n"
        "ВАЖНО: Ответ должен содержать изменения СТРОГО в XML-тегах. Никаких markdown-обёрток, "
        "никаких ``` вокруг содержимого тегов. Любой текст ВНЕ тегов попадёт пользователю как отчёт.\n\n"
        "Доступные теги:\n"
        '1) Полная перезапись/создание файла:\n'
        '<FILE path="путь/файл">ПОЛНЫЙ КОД ФАЙЛА</FILE>\n\n'
        '2) Точечная замена фрагмента (предпочтительно для небольших правок):\n'
        '<EDIT path="путь/файл"><OLD>точные старые строки из файла</OLD><NEW>новые строки</NEW></EDIT>\n\n'
        "Правила:\n"
        "- Можно вернуть несколько <FILE> и/или <EDIT> подряд.\n"
        "- В <OLD> вставляй ТОЧНЫЙ фрагмент текущего файла. Пробелы и переносы сопоставляются гибко, "
        "но чем точнее — тем надёжнее.\n"
        "- Для больших изменений используй <FILE>, для мелких — <EDIT>.\n"
        "- Не оборачивай содержимое в ```.\n\n"
        "Текущий index.html (если существует):\n"
        "----- НАЧАЛО index.html -----\n"
        f"{index_html}\n"
        "----- КОНЕЦ index.html -----\n\n"
        "Запрос пользователя:\n"
        f"{issue_body}\n\n"
        "Верни ответ с XML-тегами."
    )


# ---------- Основная логика ----------

def main():
    api_key = os.environ.get("AI_API_KEY", "")
    issue_body = os.environ.get("ISSUE_BODY", "")

    if not api_key:
        raise RuntimeError("Переменная окружения AI_API_KEY не задана")

    index_html = read_file("index.html")
    prompt = build_prompt(issue_body, index_html)

    models_url = "https://api.zveno.ai/v1/models"
    chat_url = "https://api.zveno.ai/v1/chat/completions"

    # 1. Получаем список моделей
    available_ids = []
    models_error = None
    try:
        raw_models = http_get_json(models_url, api_key)
        available_ids = parse_models_list(raw_models)
    except urllib.error.HTTPError as e:
        models_error = f"HTTP {e.code}: {e.read().decode('utf-8', errors='replace')[:300]}"
    except Exception as e:
        models_error = f"{type(e).__name__}: {e}"

    # 2. Выбираем Claude Sonnet
    candidate_models = []
    selected = select_claude_model(available_ids)
    if selected:
        candidate_models.append(selected)

    # Fallback-список
    FALLBACK_CLAUDE = [
        "anthropic/claude-3.7-sonnet",
        "anthropic/claude-3-7-sonnet",
        "anthropic/claude-3.5-sonnet",
        "anthropic/claude-3-5-sonnet",
        "anthropic/claude-sonnet-4",
        "claude-3-5-sonnet-20241022",
    ]
    for m in FALLBACK_CLAUDE:
        if m not in candidate_models:
            candidate_models.append(m)

    if not candidate_models:
        raise RuntimeError("Не удалось подобрать ни одной Claude Sonnet модели")

    # 3. Пробуем модели по очереди
    used_model = None
    model_text = None
    last_errors = []

    for model_id in candidate_models:
        payload = {
            "model": model_id,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.2,
            "max_tokens": 16000,
        }
        try:
            raw = http_post_json(chat_url, api_key, payload)
            parsed = json.loads(raw)
            model_text = parsed["choices"][0]["message"]["content"]
            used_model = model_id
            break
        except urllib.error.HTTPError as e:
            body_err = e.read().decode("utf-8", errors="replace")[:300]
            last_errors.append(f"{model_id} → HTTP {e.code}: {body_err}")
        except Exception as e:
            last_errors.append(f"{model_id} → {type(e).__name__}: {e}")

    if model_text is None:
        raise RuntimeError(
            "Не удалось получить ответ ни от одной модели Claude Sonnet.\n"
            + ("Ошибка /models: " + models_error + "\n" if models_error else "")
            + "Ошибки попыток:\n" + "\n".join(last_errors)
        )

    # 4. Применяем изменения
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

    # 5. Формируем отчёт
    report_parts = []
    report_parts.append(f"🤖 Использована модель Claude: `{used_model}`")
    if available_ids:
        report_parts.append(f"Всего моделей на Zveno AI: {len(available_ids)}")
    if models_error:
        report_parts.append(f"⚠️ /models не загрузился: {models_error}")

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
