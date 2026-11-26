import os
import json
import urllib.request
import urllib.error

API_URL = "https://zveno.ai"
API_KEY = os.environ.get("AI_API_KEY")
ISSUE_TITLE = os.environ.get("ISSUE_TITLE", "")
ISSUE_BODY = os.environ.get("ISSUE_BODY", "")

MODELS = [
    "deepseek/deepseek-chat",
    "deepseek/deepseek-v3",
    "openai/gpt-4o",
    "openai/gpt-4o-mini"
]

PROMPT = """Ты — опытный программист. Твоя задача — выполнить запрос пользователя и создать необходимые файлы.
Верни ответ СТРОГО в формате валидного JSON без каких-либо дополнительных текстов до или после.
Формат JSON:
{
  "reply": "подробный отчёт на русском, какие папки и файлы созданы",
  "files": [
    {"path": "путь/к/файлу.txt", "content": "полное содержимое файла"}
  ]
}
Если создавать файлы не нужно, верни пустой массив "files": [].
"""

def write_report(text):
    with open("r.txt", "w", encoding="utf-8") as f:
        f.write(text)

def extract_json(text):
    text = text.strip()
    if text.startswith("```json"):
        text = text[7:]
    elif text.startswith("```"):
        text = text[3:]
    if text.endswith("```"):
        text = text[:-3]
    text = text.strip()
    
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        json_str = text[start:end+1]
        try:
            return json.loads(json_str)
        except json.JSONDecodeError:
            pass
    return None

def main():
    if not API_KEY:
        write_report("Ошибка: Переменная окружения AI_API_KEY не задана.")
        return

    user_content = f"Заголовок задачи: {ISSUE_TITLE}\n\nОписание / комментарий:\n{ISSUE_BODY}"
    
    payload = {
        "messages": [
            {"role": "system", "content": PROMPT},
            {"role": "user", "content": user_content}
        ],
        "temperature": 0.1
    }
    
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0"
    }

    success_data = None
    last_error = ""

    for model in MODELS:
        payload["model"] = model
        data = json.dumps(payload).encode('utf-8')
        req = urllib.request.Request(API_URL, data=data, headers=headers, method="POST")
        
        try:
            with urllib.request.urlopen(req, timeout=60) as response:
                resp_body = response.read().decode('utf-8')
                resp_json = json.loads(resp_body)
                content = resp_json.get("choices", [{}])[0].get("message", {}).get("content", "")
                
                parsed = extract_json(content)
                if parsed and "reply" in parsed and "files" in parsed:
                    success_data = parsed
                    break
                else:
                    last_error = f"Модель {model} вернула невалидный JSON: {content[:200]}..."
        except urllib.error.HTTPError as e:
            last_error = f"HTTP ошибка {e.code} от {model}: {e.read().decode('utf-8')}"
        except Exception as e:
            last_error = f"Системная ошибка с {model}: {str(e)}"

    if success_data:
        report = success_data.get("reply", "Готово.")
        files = success_data.get("files", [])
        
        created_files = []
        for file_info in files:
            path = file_info.get("path")
            content = file_info.get("content", "")
            if path:
                try:
                    dirname = os.path.dirname(path)
                    if dirname:
                        os.makedirs(dirname, exist_ok=True)
                    with open(path, "w", encoding="utf-8") as f:
                        f.write(content)
                    created_files.append(path)
                except Exception as e:
                    report += f"\n\n⚠️ Ошибка при создании файла {path}: {str(e)}"
        
        if created_files:
            report += f"\n\n📦 **Успешно созданы файлы:**\n" + "\n".join([f"- `{f}`" for f in created_files])
        
        write_report(report)
    else:
        write_report(f"⚠️ Не удалось получить ответ от нейросети.\nПоследняя ошибка: {last_error}")

if __name__ == "__main__":
    main()
