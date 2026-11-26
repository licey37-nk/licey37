import os
import json
import urllib.request
import urllib.error
import re
import sys

API_KEY = os.environ.get("AI_API_KEY", "")
ISSUE_BODY = os.environ.get("ISSUE_BODY", "")
BASE_URLS = ["https://zveno.ai", "https://zveno.ai"]
FALLBACK_MODELS = ["deepseek/deepseek-chat", "deepseek-chat", "openai/gpt-4o", "gpt-4o", "openai/gpt-4o-mini"]
HEADERS = {
    "Authorization": f"Bearer {API_KEY}",
    "User-Agent": "Mozilla/5.0",
    "Content-Type": "application/json",
}

log_lines = []

def log(msg):
    print(msg)
    log_lines.append(msg)

def make_request(url, method="GET", data=None, headers=None):
    req = urllib.request.Request(url, method=method, headers=headers or HEADERS)
    if data is not None:
        req.data = json.dumps(data).encode("utf-8")
    try:
        with urllib.request.urlopen(req, timeout=90) as resp:
            return resp.status, resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", errors="replace")
    except Exception as e:
        return 0, str(e)

def extract_json(text):
    if not text:
        return None
    try:
        return json.loads(text)
    except:
        pass
    patterns = [
        r'```(?:json)?\s*(\{.*?\})\s*```',
        r'(\{.*\})',
    ]
    for pat in patterns:
        match = re.search(pat, text, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(1))
            except:
                continue
    return None

def get_available_models(base_url):
    url = f"{base_url}/models"
    status, body = make_request(url, "GET")
    if status != 200:
        return None
    try:
        data = json.loads(body)
        if isinstance(data, dict) and "data" in data:
            return [m.get("id") for m in data["data"] if m.get("id")]
        elif isinstance(data, list):
            return [m.get("id") for m in data if isinstance(m, dict) and m.get("id")]
    except:
        pass
    return None

def choose_model(available_ids):
    if available_ids:
        for mid in available_ids:
            if "deepseek" in mid.lower():
                return mid
        for mid in available_ids:
            if "gpt-4o" in mid.lower():
                return mid
    return FALLBACK_MODELS[0]

def get_current_html():
    if os.path.exists("index.html"):
        with open("index.html", "r", encoding="utf-8") as f:
            txt = f.read()
            if len(txt) > 45000:
                return txt[:22000] + "\n\n... [СЕРЕДИНА ФАЙЛА СКРЫТА ДЛЯ ЭКОНОМИИ] ...\n\n" + txt[-22000:]
            return txt
    return "(Файл index.html пока не создан)"

def call_chat(base_url, model):
    url = f"{base_url}/chat/completions"
    current_html = get_current_html()
    prompt = (
        "Ты — Senior-разработчик репозитория. У тебя есть два инструмента работы с файлами:\n"
        "1. `files`: создание нового файла или полная перезапись (используй ТОЛЬКО для новых файлов или если просят переписать файл с нуля).\n"
        "2. `edits`: точечное редактирование существующего файла (замена фрагмента `old` на `new` без потери остального кода!).\n\n"
        "Верни СТРОГО JSON без markdown-обёртки:\n"
        "{\n"
        "  \"reply\": \"подробный отчёт на русском\",\n"
        "  \"files\": [{\"path\": \"путь/новый_файл.txt\", \"content\": \"содержимое\"}],\n"
        "  \"edits\": [{\"path\": \"index.html\", \"old\": \"точный старый кусок кода\", \"new\": \"новый кусок кода\"}]\n"
        "}\n\n"
        f"Текущий код index.html:\n```html\n{current_html}\n```\n\n"
        f"Запрос пользователя: {ISSUE_BODY}\n"
        "Верни только валидный JSON."
    )
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.2,
    }
    status, body = make_request(url, "POST", data=payload)
    log(f"[POST] {url} ({model}) -> {status}")
    if status != 200:
        log(f"  Ошибка: {body[:300]}")
        return None
    try:
        data = json.loads(body)
        return data["choices"][0]["message"]["content"]
    except Exception as e:
        log(f"  Ошибка парсинга ответа: {e}")
        return None

def process_result(content):
    obj = extract_json(content)
    if not obj:
        return "❌ Не удалось извлечь JSON из ответа.\n\n" + content[:800]
    reply = obj.get("reply", "Готово.")
    created = []
    edited = []

    for f in obj.get("files", []):
        path = f.get("path", "").strip()
        c_file = f.get("content", "")
        if not path or path.startswith("/") or ".." in path.split("/"):
            continue
        dir_name = os.path.dirname(path)
        if dir_name:
            os.makedirs(dir_name, exist_ok=True)
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(c_file)
        created.append(path)

    for ed in obj.get("edits", []):
        path = ed.get("path", "").strip()
        old_txt = ed.get("old", "")
        new_txt = ed.get("new", "")
        if path and os.path.exists(path) and old_txt:
            with open(path, "r", encoding="utf-8") as fh:
                file_data = fh.read()
            if old_txt in file_data:
                file_data = file_data.replace(old_txt, new_txt, 1)
                with open(path, "w", encoding="utf-8") as fh:
                    fh.write(file_data)
                edited.append(path)
            else:
                log(f"⚠️ Не найден точный фрагмент для замены в {path}")

    report = "🤖 " + reply + "\n\n"
    if created:
        report += "**Созданы/перезаписаны файлы:**\n" + "\n".join(f"- `{p}`" for p in created) + "\n"
    if edited:
        report += "**Точечно обновлены файлы (старый код сохранён):**\n" + "\n".join(f"- `{p}`" for p in edited) + "\n"
    if not created and not edited:
        report += "Файлы не изменялись."
    return report

def main():
    if not API_KEY:
        with open("r.txt", "w", encoding="utf-8") as f:
            f.write("❌ Ошибка: AI_API_KEY не задан.")
        sys.exit(0)

    for base in BASE_URLS:
        available = get_available_models(base)
        model = choose_model(available)
        content = call_chat(base, model)
        if content:
            final_report = process_result(content)
            with open("r.txt", "w", encoding="utf-8") as f:
                f.write(final_report)
            return

    with open("r.txt", "w", encoding="utf-8") as f:
        f.write("❌ Все попытки не удались:\n" + "\n".join(log_lines))

if __name__ == "__main__":
    main()
