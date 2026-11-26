import os
import json
import urllib.request
import urllib.error
import re
import traceback

API_KEY = os.environ.get("AI_API_KEY", "")
ISSUE_BODY = os.environ.get("ISSUE_BODY", "")
BASE_URLS = ["https://zveno.ai", "https://zveno.ai"]
MODEL = "anthropic/claude-3.5-sonnet"
HEADERS = {
    "Authorization": f"Bearer {API_KEY}",
    "User-Agent": "Mozilla/5.0",
    "Content-Type": "application/json",
}

def make_request(url, data):
    req = urllib.request.Request(url, data=json.dumps(data).encode("utf-8"), headers=HEADERS, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            return resp.status, resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", errors="replace")
    except Exception as e:
        return 0, str(e)

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
    try:
        if not API_KEY:
            with open("r.txt", "w", encoding="utf-8") as f:
                f.write("❌ Ошибка: AI_API_KEY не задан.")
            return

        current_html = ""
        if os.path.exists("index.html"):
            with open("index.html", "r", encoding="utf-8") as f:
                current_html = f.read()

        prompt = (
            "Ты — Senior Fullstack-разработчик портала МБОУ «Лицей №37» г. Нижнекамск.\n"
            "НЕ ИСПОЛЬЗУЙ JSON! Возвращай изменения строго в специальных XML-тегах:\n"
            "1. Для полной перезаписи или создания файла:\n"
            "<FILE path=\"index.html\">\nполный код файла без markdown-обёртки\n</FILE>\n\n"
            "2. Для точечного редактирования без потери старого кода:\n"
            "<EDIT path=\"index.html\">\n<OLD>\nточные 3-5 строк из существующего кода\n</OLD>\n<NEW>\nновые строки\n</NEW>\n</EDIT>\n\n"
            "В конце напиши 2–3 предложения отчёта на русском языке.\n\n"
            f"Текущий index.html (строк: {len(current_html.splitlines())}):\n{current_html}\n\n"
            f"Задача пользователя:\n{ISSUE_BODY}"
        )

        payload = {
            "model": MODEL,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.2,
            "max_tokens": 16000
        }

        last_err = ""
        for base in BASE_URLS:
            status, body = make_request(f"{base}/chat/completions", payload)
            if status == 200:
                content = json.loads(body)["choices"][0]["message"]["content"]
                created, edited, failed = [], [], []

                for m in re.finditer(r'<FILE\s+path=["\']([^"\']+)["\']>\s*(.*?)\s*</FILE>', content, re.DOTALL):
                    path, code = m.group(1).strip(), m.group(2)
                    code = re.sub(r'^```[a-zA-Z]*\s*|\s*```$', '', code.strip())
                    if path and not path.startswith("/") and ".." not in path:
                        if os.path.dirname(path):
                            os.makedirs(os.path.dirname(path), exist_ok=True)
                        with open(path, "w", encoding="utf-8") as fh:
                            fh.write(code)
                        created.append(path)

                for m in re.finditer(r'<EDIT\s+path=["\']([^"\']+)["\']>\s*<OLD>\s*(.*?)\s*</OLD>\s*<NEW>\s*(.*?)\s*</NEW>\s*</EDIT>', content, re.DOTALL):
                    path, old_t, new_t = m.group(1).strip(), m.group(2), m.group(3)
                    if path and os.path.exists(path):
                        with open(path, "r", encoding="utf-8") as fh:
                            f_data = fh.read()
                        upd, ok = smart_replace(f_data, old_t, new_t)
                        if ok:
                            with open(path, "w", encoding="utf-8") as fh:
                                fh.write(upd)
                            edited.append(path)
                        else:
                            failed.append(old_t[:50])

                summary = re.sub(r'<(FILE|EDIT).*?</\1>', '', content, flags=re.DOTALL).strip()
                rep = f"🤖 **Готово ({MODEL})!** {summary[:500]}\n\n"
                if created:
                    rep += "✅ **Перезаписаны/созданы:** " + ", ".join(f"`{x}`" for x in created) + "\n"
                if edited:
                    rep += "✅ **Точечно обновлены:** " + ", ".join(f"`{x}`" for x in edited) + "\n"
                if failed:
                    rep += "⚠️ **Не совпали блоки:** " + ", ".join(f"`{x}...`" for x in failed) + "\n"
                if not created and not edited and not failed:
                    rep += f"⚠️ Модель не вернула теги `<FILE>` или `<EDIT>`. Начало ответа:\n```\n{content[:400]}\n```"

                with open("r.txt", "w", encoding="utf-8") as f:
                    f.write(rep)
                return
            else:
                last_err = f"HTTP {status}: {body[:300]}"

        with open("r.txt", "w", encoding="utf-8") as f:
            f.write(f"❌ Ошибка связи с сервером Zveno AI ({last_err}).")
    except Exception:
        with open("r.txt", "w", encoding="utf-8") as f:
            f.write(f"❌ Ошибка выполнения:\n```\n{traceback.format_exc()}\n```")

if __name__ == "__main__":
    main()
