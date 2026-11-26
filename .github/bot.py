import os
import json
import urllib.request
import urllib.error
import re
import sys

API_KEY = os.environ.get("AI_API_KEY", "")
ISSUE_BODY = os.environ.get("ISSUE_BODY", "")
BASE_URLS = ["https://api.zveno.ai/v1", "https://zveno.ai/api/v1"]
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
        with urllib.request.urlopen(req, timeout=60) as resp:
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
    log(f"[GET /models] {url} -> {status}")
    if status != 200:
        log(f"  Тело (первые 300): {body[:300]}")
        return None
    try:
        data = json.loads(body)
        if isinstance(data, dict) and "data" in data:
            ids = [m.get("id") for m in data["data"] if m.get("id")]
        elif isinstance(data, list):
            ids = [m.get("id") for m in data if isinstance(m, dict) and m.get("id")]
        else:
            ids = []
        log(f"  Доступные модели: {ids}")
        return ids if ids else None
    except Exception as e:
        log(f"  Ошибка парсинга /models: {e}")
        return None

def choose_model(available_ids):
    if available_ids:
        for mid in available_ids:
            if "deepseek" in mid.lower():
                log(f"Выбрана модель из /models (deepseek): {mid}")
                return mid
        for mid in available_ids:
            if "gpt-4o" in mid.lower():
                log(f"Выбрана модель из /models (gpt-4o): {mid}")
                return mid
        log("Подходящих моделей не найдено в /models, используется fallback.")
    for mid in FALLBACK_MODELS:
        log(f"Fallback-модель: {mid}")
        return mid
    return "deepseek/deepseek-chat"

def call_chat(base_url, model):
    url = f"{base_url}/chat/completions"
    prompt = (
        "Ты — бот, который создаёт файлы в репозитории. "
        "Верни СТРОГО JSON без markdown-обёртки, без пояснений. "
        "Формат: {\"reply\": \"подробный отчёт на русском, какие папки и файлы созданы\", "
        "\"files\": [{\"path\": \"путь/к/файлу.txt\", \"content\": \"полное содержимое файла\"}]}. "
        f"Запрос пользователя: {ISSUE_BODY}\n"
        "Верни только JSON-объект."
    )
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.2,
    }
    status, body = make_request(url, "POST", data=payload)
    log(f"[POST /chat/completions] {url} (model={model}) -> {status}")
    if status != 200:
        log(f"  Тело (первые 300): {body[:300]}")
        return None
    try:
        data = json.loads(body)
        content = data["choices"][0]["message"]["content"]
        log(f"  Получен ответ (первые 200): {content[:200]}")
        return content
    except Exception as e:
        log(f"  Ошибка извлечения content: {e}, тело: {body[:300]}")
        return None

def process_result(content):
    obj = extract_json(content)
    if not obj:
        return "❌ Не удалось извлечь JSON из ответа модели.\n\nСырой ответ:\n" + content[:1000]
    reply = obj.get("reply", "Отчёт не предоставлен.")
    files = obj.get("files", [])
    created = []
    for f in files:
        path = f.get("path", "").strip()
        content_file = f.get("content", "")
        if not path:
            continue
        if path.startswith("/") or ".." in path.split("/"):
            log(f"Пропущен небезопасный путь: {path}")
            continue
        dir_name = os.path.dirname(path)
        if dir_name:
            os.makedirs(dir_name, exist_ok=True)
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(content_file)
        created.append(path)
        log(f"Создан файл: {path}")
    report = "🤖 " + reply + "\n\n"
    if created:
        report += "**Созданные файлы:**\n" + "\n".join(f"- `{p}`" for p in created)
    else:
        report += "Файлы не были созданы (поле `files` пусто или отсутствует)."
    return report

def main():
    if not API_KEY:
        with open("r.txt", "w", encoding="utf-8") as f:
            f.write("❌ Ошибка: переменная окружения AI_API_KEY не задана.")
        sys.exit(0)

    log(f"Запрос: {ISSUE_BODY[:200]}")
    success = False
    final_report = ""

    for base in BASE_URLS:
        log(f"\n=== Проверка базового URL: {base} ===")
        available = get_available_models(base)
        model = choose_model(available)
        log(f"Итоговая модель для {base}: {model}")
        content = call_chat(base, model)
        if content:
            final_report = process_result(content)
            success = True
            break
        else:
            log(f"Не удалось получить ответ от {base}")

    if not success:
        final_report = "❌ Все попытки не удались. Подробный лог:\n\n" + "\n".join(log_lines)
    else:
        final_report = final_report + "\n\n---\nЛог:\n" + "\n".join(log_lines[-10:])

    with open("r.txt", "w", encoding="utf-8") as f:
        f.write(final_report)
    print("r.txt записан.")

if __name__ == "__main__":
    main()
