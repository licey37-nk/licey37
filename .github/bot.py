import os
import json
import urllib.request
import urllib.error
import re
import sys

API_KEY = os.environ.get("AI_API_KEY", "")
ISSUE_BODY = os.environ.get("ISSUE_BODY", "")
BASE_URLS = ["https://zveno.ai", "https://zveno.ai"]
MODEL = "deepseek/deepseek-chat"
HEADERS = {
    "Authorization": f"Bearer {API_KEY}",
    "User-Agent": "Mozilla/5.0",
    "Content-Type": "application/json",
}

log_lines = []

def log(msg):
    print(msg)
    log_lines.append(msg)

def make_request(url, method="GET", data=None):
    req = urllib.request.Request(url, method=method, headers=HEADERS)
    if data is not None:
        req.data = json.dumps(data).encode("utf-8")
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
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
    patterns = [r'```(?:json)?\s*(\{.*?\})\s*```', r'(\{.*\})']
    for pat in patterns:
        match = re.search(pat, text, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(1))
            except:
                continue
    return None

def smart_replace(content, old_block, new_block):
    if old_block in content:
        return content.replace(old_block, new_block, 1), True
    pattern = r'\s+'.join(re.escape(part) for part in old_block.split())
    if pattern:
        new_content, count = re.subn(pattern, lambda m: new_block, content, count=1)
        if count > 0:
            return new_content, True
    return content, False

def main():
    if not API_KEY:
        with open("r.txt", "w", encoding="utf-8") as f:
            f.write("❌ Ошибка: AI_API_KEY не задан.")
        sys.exit(0)

    current_html = ""
    if os.path.exists("index.html"):
        with open("index.html", "r", encoding="utf-8") as f:
            current_html = f.read()

    prompt = (
        "Ты — Senior Fullstack-разработчик портала МБОУ «Лицей №37» г. Нижнекамск.\n"
        "Внимательно изучи текущий код `index.html` и ДОПОЛНИ его всеми запрошенными функциями через инструмент `edits` (НИЧЕГО не удаляй из уже работающего кода!).\n"
        "Для вставки нового HTML-блока бери в `old` последние 3–5 строк перед `</body>`, а для добавления нового JS-кода бери в `old` последние 3–5 строк перед `</script>`.\n\n"
        "Верни СТРОГО валидный JSON без лишнего текста:\n"
        "{\n"
        "  \"reply\": \"подробный отчёт на русском, какие функции добавлены\",\n"
        "  \"files\": [],\n"
        "  \"edits\": [{\"path\": \"index.html\", \"old\": \"точный фрагмент из конца index.html\", \"new\": \"обновлённый фрагмент с новым кодом\"}]\n"
        "}\n\n"
        f"Текущий index.html:\n```html\n{current_html}\n```\n\n"
        f"Задача:\n{ISSUE_BODY}\n"
        "Верни только JSON."
    )

    payload = {
        "model": MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.2,
        "max_tokens": 16000
    }

    for base in BASE_URLS:
        status, body = make_request(f"{base}/chat/completions", "POST", data=payload)
        log(f"[POST] {base} -> {status}")
        if status == 200:
            try:
                content = json.loads(body)["choices"]["message"]["content"]
                obj = extract_json(content)
                if obj:
                    reply = obj.get("reply", "Готово.")
                    edited, failed = [], []
                    for ed in obj.get("edits", []):
                        path = ed.get("path", "").strip()
                        old_txt = ed.get("old", "")
                        new_txt = ed.get("new", "")
                        if path and os.path.exists(path) and old_txt:
                            with open(path, "r", encoding="utf-8") as fh:
                                file_data = fh.read()
                            updated, ok = smart_replace(file_data, old_txt, new_txt)
                            if ok:
                                with open(path, "w", encoding="utf-8") as fh:
                                    fh.write(updated)
                                edited.append(path)
                            else:
                                failed.append(old_txt[:60])
                    rep = f"🤖 **{reply}**\n\n"
                    if edited:
                        rep += "✅ **Успешно обновлены файлы:** " + ", ".join(f"`{x}`" for x in edited)
                    if failed:
                        rep += "\n⚠️ **Не найдены фрагменты:** " + ", ".join(f"`{x}...`" for x in failed)
                    with open("r.txt", "w", encoding="utf-8") as f:
                        f.write(rep)
                    return
            except Exception as e:
                log(f"Ошибка разбора ответа: {e}")
        else:
            log(f"Ответ сервера: {body[:300]}")

    with open("r.txt", "w", encoding="utf-8") as f:
        f.write("❌ Не удалось выполнить запрос:\n" + "\n".join(log_lines))

if __name__ == "__main__":
    main()
