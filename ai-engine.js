/* ============================================================
   ai-engine.js — МОЗГ «ИИ-Наставника 37» (v4.3 Neural Engine + каталог kb/ + Википедия + стриминг)
   МБОУ «Лицей №37» г. Нижнекамска
   Вынесено из index.html. Подключается одной строкой:
   <script src="ai-engine.js"></script>
   База знаний: структурированный каталог kb/ с общим индексом
   kb/index.json (path, title, keywords, alwaysLoad). При старте
   движок читает лёгкий индекс и сразу подгружает только файлы с
   alwaysLoad: true (живое общение); при каждом вопросе ученика
   определяет 1–2 самые подходящие тематические папки по ключевым
   словам и скачивает только их (кэшируются до перезагрузки
   страницы). Новые карточки в любой папке kb/... (и обновлённые
   теги в kb/index.json) подхватываются автоматически. Если
   kb/index.json отсутствует — тихий фолбэк на старые b1.txt/b2.txt/b3.txt.
   Загружается автоматически.
   Встроено: умный калькулятор без eval(), решатель квадратных
   уравнений, перевод систем счисления, проценты, визуальный
   рендер «как у Google»: таблицы с экспортом в CSV, callouts,
   маркер-выделение, пошаговые карточки, спойлеры, файлы.
   Ленивая загрузка каталога (v4.3): локальный поиск идёт по уже
   загруженным темам; если точного ответа нет или карточка короче
   180 символов —
   официальное API Русской Википедии (opensearch + REST summary,
   origin=*, таймаут 8 с); офлайн — тихая деградация без ошибок.
   Стриминг (v4.2): ответ печатается плавно, ~250 символов в
   секунду (5 символов каждые 20 мс), с сохранением всей HTML-
   разметки; автопрокрутки во время печати нет — чат один раз
   плавно подводит к началу нового сообщения, дальше экран
   остаётся на месте (как в ChatGPT/DeepSeek).
   Все функции остаются глобальными — остальной код портала
   (викторины, глобальный поиск, уведомления) работает как раньше.
   ============================================================ */
'use strict';

    /* ============================================================
       ШАГ 5: ИИ-НАСТАВНИК 37
       ============================================================ */
    const AI_KB_INDEX37 = 'kb/index.json';
    const AI_FILES_LEGACY37 = ['b1.txt', 'b2.txt', 'b3.txt'];
    let aiKbIndex37 = [];
    let aiLoadedPaths37 = {};
    let aiKbFetches37 = {};
    const aiKnowledge = [];
    let aiLoadedFiles = 0;
    let aiChat = [];
    let aiGreeted = false;
    let aiBusy = false;
    let aiUserMsgCount = 0;
    let aiLoading37 = false;

    const AI_HI = ['Привет, {name}! 👋', 'О, приветствую, {name}! ✨', 'Здравствуй, {name}! 🌟', 'Привет-привет, {name}! 😊', 'Рад тебя видеть, {name}! 💫', 'Привет, {name}! Всегда готов помочь! 🤝', 'А вот и {name}! 🙌', 'Добрый день, {name}! ☀️', 'Приветик, {name}! 🍀', 'Хэй, {name}! ⚡', 'Привет, {name}! Какой отличный день, чтобы узнавать новое! 🚀', 'Ооо, {name} на связи! 💙'];
    const AI_LEAD = ['Вот что я знаю:', 'Смотри, получается вот что:', 'У меня есть кое-что интересное:', 'Держи ответ:', 'Рассказываю по порядку:', 'Проверил свою базу знаний — вот результат:', 'Отличный вопрос! Итак:', 'Хм, дай подумать… Вот что нашлось:', 'О, это как раз моя тема!', 'Ура, вопрос по моей специальности!'];
    const AI_LINK = ['Кстати, ', 'Интересно и то, что ', 'Ещё полезно знать: ', 'И вдобавок: ', 'Бонусом: ', 'Не менее важно: ', 'И ещё один факт: ', 'А кроме того, '];
    const AI_TAIL = ['Надеюсь, это было полезно! 😊', 'Если что — спрашивай ещё! 💙', 'Обращайся, я всегда на связи! 🤖', 'Удачи в учёбе! 🍀', 'Ты отлично справляешься! 💪', 'Пиши, если будут ещё вопросы! ✨', 'Вместе мы — Первые! 🚀', 'Лицей №37 всегда рядом! 🏫', 'Учись на здоровье! 📚', 'Веришь в тебя! 🔥'];
    const AI_THINK = ['Дай мне секундочку… ⏳', 'Сейчас посмотрю… 🔍', 'Секунду, проверяю базу… 📚', 'Хм, интересный вопрос… 🤔', 'Пороюсь в своей картотеке… 🗂️'];
    const AI_DUNNO = ['Хм, я пока не знаю точного ответа 🤔 Но я учусь каждый день! Попробуй спросить о Лицее №37, Нижнекамске или учёбе — тут я силён!', 'В моей картотеке такого не нашлось 📚 Зато я много знаю о школе, городе и предметах. Спроси что-нибудь ещё!'];

    function aiName() {
      const u = getCurrentUser();
      if (!u) return 'друг';
      return String(u.name).split(' ')[0] || u.name;
    }

    function aiPick(arr) {
      return arr[Math.floor(Math.random() * arr.length)];
    }

    function aiWords(s) {
      return String(s).toLowerCase().replace(/[^a-zа-яё0-9\s]/gi, ' ').split(/\s+/).filter(function (w) { return w.length > 2; });
    }

    /* 🩺 Врач памяти: лечит строку перед индексацией — режет дубликаты и битые строки */
    const aiSeenLines37 = new Set();
    function fmtAiNum37(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
    function aiDoctorJson37(raw) {
      if (raw.charAt(0) !== '{') return null;
      try {
        const o = JSON.parse(raw);
        if (!o || typeof o !== 'object') return null;
        const parts = [];
        ['sub', 'subject', 'gr', 'grade', 'top', 'topic', 'title', 'name', 'q', 'question', 'sum', 'summary', 'text', 'content', 'body', 'full', 'a', 'answer'].forEach(function (k) {
          const v = o[k];
          if (typeof v === 'string' && v.trim()) parts.push(v.trim());
          else if (Array.isArray(v) && v.length && typeof v[0] === 'string') parts.push(v.join(', '));
        });
        const t = parts.join('. ').replace(/\s+/g, ' ').trim();
        return t || null;
      } catch (eJson37) { return null; }
    }
    function aiDoctorLine37(t) {
      if (t.length < 25 || t.length > 600) return false;
      if (t.indexOf('\uFFFD') !== -1) return false;
      const letters = (t.match(/[a-zа-яё]/gi) || []).length;
      if (letters < 4 || letters / t.length < 0.35) return false;
      return true;
    }
    function aiPushChunk37(name, chunk) {
      const t = String(chunk).replace(/\s+/g, ' ').trim();
      if (!t || !aiDoctorLine37(t)) return;
      const key = t.toLowerCase();
      if (aiSeenLines37.has(key)) return;
      aiSeenLines37.add(key);
      aiKnowledge.push({ s: name, t: t, lt: key });
    }

    function aiIndexFile(name, text, onDone) {
      const lines = String(text || '').split('\n');
      let from = 0;
      function step37() {
        const end = Math.min(from + 500, lines.length);
        for (let i = from; i < end; i++) {
          let line = String(lines[i] || '').trim();
          if (!line) continue;
          const healed = aiDoctorJson37(line);
          if (healed) line = healed;
          else if (line.charAt(0) === '{') continue;
          while (line.length > 0) {
            if (line.length <= 300) { aiPushChunk37(name, line); break; }
            let cut = -1;
            for (let j = 120; j < Math.min(300, line.length); j++) {
              if ('.!;?'.indexOf(line[j]) !== -1) { cut = j + 1; break; }
            }
            if (cut === -1) cut = 200;
            aiPushChunk37(name, line.slice(0, cut));
            line = line.slice(cut).trim();
          }
        }
        from = end;
        updateAiStatus();
        if (from < lines.length) setTimeout(step37, 0);
        else if (onDone) onDone();
      }
      setTimeout(step37, 0);
    }

    function updateAiStatus() {
      const el = document.getElementById('ai-status');
      if (el) el.textContent = '📚 База знаний: ' + (aiLoading37 ? 'загружаю… ' + aiLoadedFiles : 'загружено ' + aiLoadedFiles) + ' файлов (' + fmtAiNum37(aiKnowledge.length) + ' тем)';
    }

    function aiKbEntry37(path) {
      for (let i = 0; i < aiKbIndex37.length; i++) {
        if (aiKbIndex37[i] && aiKbIndex37[i].path === path) return aiKbIndex37[i];
      }
      return null;
    }

    async function aiLoadKbPath37(path) {
      if (!path || aiLoadedPaths37[path]) return;
      if (aiKbFetches37[path]) { try { await aiKbFetches37[path]; } catch (eF37) {} return; }
      aiKbFetches37[path] = (async function () {
        try {
          const res = await fetch(encodeURI(path), { cache: 'no-cache' });
          if (res.ok) {
            const text = await res.text();
            if (text && text.trim()) {
              const entry = aiKbEntry37(path);
              if (entry && entry.rules) { try { aiLoadRules37(text); } catch (eRl37) {} }
              else { await new Promise(function (resolve) { aiIndexFile(path, text, resolve); }); }
              aiLoadedPaths37[path] = true;
              aiLoadedFiles++;
              updateAiStatus();
            }
          }
        } catch (e) { /* file may be missing - that is fine */ }
      })();
      try { await aiKbFetches37[path]; } catch (eF38) {}
    }

    function aiSelectKbFiles37(query, max) {
      const keys = aiAnalyzeQuery37(query);
      if (!keys.length) return [];
      const scored = [];
      for (let i = 0; i < aiKbIndex37.length; i++) {
        const e = aiKbIndex37[i];
        if (!e || !e.path || aiLoadedPaths37[e.path]) continue;
        const kws = (Array.isArray(e.keywords) ? e.keywords : []).map(function (k) { return String(k).toLowerCase(); });
        const title = String(e.title || '').toLowerCase();
        let s = 0;
        for (let j = 0; j < keys.length; j++) {
          const k = keys[j];
          let strong = false;
          for (let m = 0; m < kws.length; m++) {
            const kw37 = kws[m];
            if (kw37 === k.w || kw37 === k.stem) { strong = true; break; }
            if (kw37.length >= 4 && (k.w.indexOf(kw37) === 0 || (k.stem.length >= 4 && k.stem.indexOf(kw37) === 0))) { strong = true; break; }
            if (kw37.length > 4 && kw37.indexOf(k.stem) === 0) { strong = true; break; }
          }
          if (strong) s += 3;
          else if (title.indexOf(k.w) !== -1 || (k.stem.length >= 4 && title.indexOf(k.stem) !== -1)) s += 1;
          else {
            for (let m = 0; m < kws.length; m++) {
              if (k.w.length >= 4 && kws[m].indexOf(k.w) === 0) { s += 2; break; }
            }
          }
        }
        if (s > 0) scored.push({ path: e.path, s: s });
      }
      scored.sort(function (a, b) { return b.s - a.s; });
      return scored.slice(0, max || 2).map(function (x) { return x.path; });
    }

    async function aiEnsureKb37(query) {
      try {
        if (!aiKbIndex37.length) return;
        const picks = aiSelectKbFiles37(query, 2);
        for (let i = 0; i < picks.length; i++) await aiLoadKbPath37(picks[i]);
      } catch (eKb37) {}
    }

    async function aiLoadFiles() {
      if (typeof fetch !== 'function') { updateAiStatus(); return; }
      aiLoading37 = true;
      updateAiStatus();
      let legacy = false;
      try {
        const res = await fetch(AI_KB_INDEX37, { cache: 'no-cache' });
        if (res.ok) {
          const data = JSON.parse(await res.text());
          const list = Array.isArray(data) ? data : (data && Array.isArray(data.files) ? data.files : []);
          aiKbIndex37 = list.filter(function (e) { return e && e.path; });
        } else { legacy = true; }
      } catch (eIdx37) { legacy = true; }
      if (legacy) {
        for (let i = 0; i < AI_FILES_LEGACY37.length; i++) {
          const name = AI_FILES_LEGACY37[i];
          try {
            const res = await fetch(encodeURI(name), { cache: 'no-cache' });
            if (res.ok) {
              const text = await res.text();
              if (text && text.trim()) {
                if (name === 'b2.txt') { try { aiLoadRules37(text); } catch (eRl37) {} }
                else { await new Promise(function (resolve) { aiIndexFile(name, text, resolve); }); }
                aiLoadedPaths37[name] = true;
                aiLoadedFiles++;
                updateAiStatus();
              }
            }
          } catch (e) { /* file may be missing - that is fine */ }
        }
      } else {
        for (let i = 0; i < aiKbIndex37.length; i++) {
          const e = aiKbIndex37[i];
          if (e && e.alwaysLoad) await aiLoadKbPath37(e.path);
        }
      }
      aiLoading37 = false;
      updateAiStatus();
    }

    /* v3.7 Neural Engine: полный смысловой разбор всего запроса (без срабатывания по первым трём буквам) */
    const AI_STOP_WORDS37 = ['привет', 'пока', 'спасибо', 'пожалуйста', 'подскажи', 'подскажите', 'объясни', 'объясните', 'расскажи', 'расскажите', 'хочу', 'знать', 'узнать', 'могу', 'можно', 'нужно', 'надо', 'давай', 'давайте', 'например', 'просто', 'очень', 'больше', 'меньше', 'тогда', 'когда', 'почему', 'зачем', 'какой', 'какая', 'какие', 'каково', 'чего', 'чего-то', 'тебя', 'тебе', 'мне', 'нас', 'вас', 'них', 'него', 'неё', 'себя', 'твой', 'твоя', 'моё', 'моя', 'твои', 'мои', 'это', 'эта', 'эти', 'тот', 'та', 'те', 'или', 'либо', 'быть', 'будет', 'будут', 'был', 'была', 'были', 'есть', 'значит', 'типа', 'типе', 'the', 'and', 'for', 'you', 'your', 'what', 'how', 'why', 'where', 'please', 'about'];
    function aiStem37(w) {
      if (w.length < 6) return w;
      return w.replace(/(ами|ями|ого|его|ому|ему|ыми|ими|ать|ять|еть|ить|ыть|ешь|ишь|ует|ают|яют|ах|ях|ам|ям|ов|ев|ей|ой|ый|ий|ая|яя|ое|ее|ые|ие|ом|ем|ью|ия|ии)$/, '');
    }
    function aiAnalyzeQuery37(query) {
      const words = aiWords(query);
      const seen = {};
      const keys = [];
      words.forEach(function (w) {
        if (AI_STOP_WORDS37.indexOf(w) !== -1 || seen[w]) return;
        seen[w] = true;
        keys.push({ w: w, stem: aiStem37(w), weight: Math.min(2.2, 0.8 + w.length * 0.09) });
      });
      return keys;
    }
    let aiLastReasoning37 = null;
    function aiReasoningLine37(coverage) {
      const r = aiLastReasoning37;
      if (!r || !r.length) return '';
      const pct = typeof coverage === 'number' && coverage > 0 ? ' (покрытие ~' + Math.round(coverage * 100) + '%)' : '';
      return '🧠 Мысли: прочитал запрос целиком и выделил ключевые слова — «' + r.slice(0, 6).map(function (k) { return k.w; }).join('», «') + '»' + pct + '. ';
    }
    function aiSearchKnowledge(query, limit) {
      const keys = aiAnalyzeQuery37(query);
      const lowQuery = String(query).toLowerCase().replace(/\s+/g, ' ').trim();
      if (!keys.length) return [];
      const totalW = keys.reduce(function (s, k) { return s + k.weight; }, 0) || 1;
      const scored = [];
      for (let i = 0; i < aiKnowledge.length; i++) {
        const t = aiKnowledge[i].lt || String(aiKnowledge[i].t).toLowerCase();
        let hitW = 0;
        let hits = 0;
        for (let j = 0; j < keys.length; j++) {
          const k = keys[j];
          const full = t.indexOf(k.w) !== -1;
          const stem = !full && k.stem.length >= 4 && t.indexOf(k.stem) !== -1;
          if (full || stem) { hitW += k.weight * (full ? 1 : 0.55); hits++; }
        }
        if (!hits) continue;
        const coverage = hits / keys.length;
        const phraseBonus = lowQuery.length > 8 && t.indexOf(lowQuery) !== -1 ? 1.5 : 0;
        const score = coverage * 100 + (hitW / totalW) * 60 + phraseBonus;
        scored.push({ item: aiKnowledge[i], score: score, coverage: coverage });
      }
      scored.sort(function (a, b) { return b.score - a.score || b.coverage - a.coverage; });
      if (scored.length) aiLastReasoning37 = keys;
      return scored.slice(0, limit || 3).map(function (x) { return x.item; });
    }

    function aiComposeAnswer(query, facts) {
      const parts = [];
      if (!aiGreeted) parts.push(aiPick(AI_HI).replace('{name}', aiName()));
      parts.push(aiPick(AI_LEAD));
      facts.slice(0, 3).forEach(function (f, i) {
        let t = String(f.t).replace(/\s+/g, ' ').trim();
        if (i > 0) t = aiPick(AI_LINK) + t.charAt(0).toLowerCase() + t.slice(1);
        parts.push(t + (/[.!?…]$/.test(t) ? '' : '.'));
      });
      parts.push(aiPick(AI_TAIL));
      return parts.join(' ');
    }

    async function aiFetchText(url) {
      const res = await fetch('https://r.jina.ai/' + url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.text();
    }

    /* v4.1 Двухступенчатый поиск: локальная база -> Русская Википедия (официальный бесплатный API, CORS через origin=*) */
    const AI_WIKI_TIMEOUT37 = 8000;
    async function aiWikiFetch37(url) {
      const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
      const timer = ctrl ? setTimeout(function () { try { ctrl.abort(); } catch (e37) {} }, AI_WIKI_TIMEOUT37) : null;
      try {
        const res = await fetch(url, ctrl ? { signal: ctrl.signal } : undefined);
        if (!res.ok) return null;
        return await res.json();
      } catch (e37) {
        return null;
      } finally {
        if (timer) clearTimeout(timer);
      }
    }
    async function aiWikiAnswer37(query) {
      const q = String(query || '').replace(/\s+/g, ' ').trim();
      if (!q || q.length < 3) return '';
      const found37 = await aiWikiFetch37('https://ru.wikipedia.org/w/api.php?action=opensearch&search=' + encodeURIComponent(q) + '&limit=1&format=json&origin=*');
      let title37 = '';
      if (found37 && Array.isArray(found37[1]) && found37[1].length) title37 = String(found37[1][0]);
      if (!title37) return '';
      const sum37 = await aiWikiFetch37('https://ru.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(title37));
      let extract37 = sum37 && typeof sum37.extract === 'string' ? sum37.extract.trim() : '';
      if (!extract37) return '';
      if (extract37.length > 700) extract37 = extract37.slice(0, 697).replace(/\s+\S*$/, '') + '…';
      const url37 = (sum37 && sum37.content_urls && sum37.content_urls.desktop && sum37.content_urls.desktop.page)
        ? sum37.content_urls.desktop.page
        : 'https://ru.wikipedia.org/wiki/' + encodeURIComponent(title37);
      return '**' + title37 + '** — ' + extract37 + '\n🔗 Читать полностью: ' + url37;
    }

    async function aiWebSearch(query) {
      const out = [];
      try {
        const res = await fetch('https://ru.wikipedia.org/w/api.php?action=query&list=search&format=json&origin=*&srsearch=' + encodeURIComponent(query));
        if (res.ok) {
          const data = await res.json();
          ((data.query && data.query.search) || []).slice(0, 3).forEach(function (r) {
            out.push('📖 ' + r.title + ': ' + String(r.snippet || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
          });
        }
      } catch (e) { /* тихо */ }
      try {
        const ddg = await aiFetchText('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query));
        ddg.split('\n').map(function (l) { return l.trim(); }).filter(function (l) { return l.length > 60 && l.length < 300; }).slice(0, 3).forEach(function (l) { out.push(l); });
      } catch (e) { /* тихо */ }
      return out;
    }

    async function aiReadUrl(url) {
      const text = await aiFetchText(url);
      return text.split('\n').map(function (s) { return s.trim(); }).filter(function (s) { return s.length > 40; }).slice(0, 5);
    }

    function aiQuizFromKnowledge() {
      const qs = [];
      const candidates = aiKnowledge.filter(function (k) {
        const t = k.t;
        return t.length < 250 && (/ — /.test(t) || / – /.test(t) || /\bэто\s/i.test(t));
      });
      for (let i = candidates.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = candidates[i]; candidates[i] = candidates[j]; candidates[j] = tmp;
      }
      for (let i = 0; i < candidates.length && qs.length < 10; i++) {
        const t = candidates[i].t;
        let left = '';
        let right = '';
        const dashIdx = t.search(/ — | – /);
        if (dashIdx > 3) {
          left = t.slice(0, dashIdx).trim();
          right = t.slice(dashIdx + 3).trim();
        } else {
          const m = t.match(/^(.{10,120}?)\bэто\s+(.{5,120})$/i);
          if (!m) continue;
          left = m[1].trim();
          right = m[2].trim();
        }
        if (left.length < 10 || left.length > 140 || right.length < 3 || right.length > 90) continue;
        const wrong = [];
        for (let j = 0; j < candidates.length && wrong.length < 3; j++) {
          if (j === i) continue;
          const cand = candidates[j].t.split(/ — | – /).pop().trim();
          if (cand !== right && cand.length >= 3 && cand.length <= 90 && wrong.indexOf(cand) === -1) wrong.push(cand);
        }
        if (wrong.length < 3) continue;
        const idx = [0, 1, 2, 3];
        for (let s = idx.length - 1; s > 0; s--) {
          const r = Math.floor(Math.random() * (s + 1));
          const t2 = idx[s]; idx[s] = idx[r]; idx[r] = t2;
        }
        qs.push({ q: 'Что такое: ' + left + '?', answers: idx.map(function (ix) { return [right, wrong[0], wrong[1], wrong[2]][ix]; }), correct: idx.indexOf(0) });
      }
      return qs;
    }

    try {
  window.aiGenerateQuizQuestions = async function () {
        try {
          const made = aiQuizFromKnowledge();
          if (made.length >= 5) return made;
        } catch (e) { /* падаем на банк вопросов */ }
        return generateQuizRound();
      };
} catch (errInit37) { try { console.error("Инициализация модуля:", errInit37); } catch (eI37) {} }

    function aiStartQuizFromTutor(round) {
      if (typeof setTab === 'function') setTab('games');
      if (typeof startQuiz === 'function') startQuiz(round);
    }

    function aiRememberUser(text) {
      aiChat.push({ who: 'user', t: text, ts: Date.now() });
      if (aiChat.length > 20) aiChat = aiChat.slice(-20);
      aiUserMsgCount++;
      let facts = [];
      try { facts = JSON.parse(localStorage.getItem('lp37_ai_medical_facts') || '[]'); } catch (e) { facts = []; }
      let changed = false;
      function addFact(t, tag) {
        t = String(t).trim();
        if (t.length < 4) return;
        if (t.length > 120) t = t.slice(0, 117) + '…';
        const telegraph = tag + ' ' + t;
        if (!facts.some(function (f) { return f.t === telegraph; })) {
          facts.push({ t: telegraph, ts: Date.now() });
          changed = true;
        }
      }
      const user = getCurrentUser();
      if (user && !facts.some(function (f) { return f.k === 'profile'; })) {
        facts.push({ t: '👤 ' + user.name + ', ' + classIdOf(user.grade, user.letter), ts: Date.now(), k: 'profile' });
        changed = true;
      }
      if (/запомни/i.test(text)) addFact(text.replace(/^[\s\S]*?запомни[:,\s]+/i, ''), '📌');
      const nm = text.match(/меня зовут\s+([\wа-яё\- ]{3,32})/i);
      if (nm) addFact(nm[1].trim(), '🏷 Зовут:');
      const cl = text.match(/\b(\d{1,2})\s?([АБВГДабвгд])\b/);
      if (cl && Number(cl[1]) >= 1 && Number(cl[1]) <= 11) addFact('🏫 Класс: ' + cl[1] + cl[2].toUpperCase(), '');
      if (/люблю|увлекаюсь|интересуюсь/i.test(text)) addFact(text.trim(), '💜');
      if (/напомни/i.test(text)) addFact(text.trim(), '⏰');
      if (aiUserMsgCount % 6 === 0) {
        const topic = aiWords(text).slice(0, 3).join(', ');
        if (topic) addFact(topic, '🗂 Тема диалога:');
      }
      if (changed) {
        while (facts.length > 30) facts.shift();
        try { localStorage.setItem('lp37_ai_medical_facts', JSON.stringify(facts)); } catch (e) {}
      }
    }

    function aiShowMemoryCard() {
      let facts = [];
      try { facts = JSON.parse(localStorage.getItem('lp37_ai_medical_facts') || '[]'); } catch (e) {}
      const text = facts.length
        ? '🧠 Карточка памяти — что я знаю о тебе:\n' + facts.map(function (f) { return '• ' + f.t; }).join('\n')
        : '🧠 Карточка памяти пока пуста. Расскажи о себе — например: «Запомни, я люблю физику» — и я всё зафиксирую!';
      aiPushMsg('bot', text);
    }

    function aiPushMsg(who, text, cls) {
      aiChat.push({ who: who, t: text, ts: Date.now(), cls: cls || '' });
      if (aiChat.length > 22) aiChat = aiChat.slice(-22);
      renderAiMsgs();
    }

    function renderAiMsgs() {
      const wrap = document.getElementById('ai-msgs');
      if (!wrap) return;
      wrap.innerHTML = aiChat.map(function (m) {
        const cls = m.who === 'user' ? 'user' : (m.cls === 'facts' ? 'bot ai-facts' : 'bot');
        return '<div class="ai-msg ' + cls + '">' + esc(m.t) + '</div>';
      }).join('');
      wrap.scrollTop = wrap.scrollHeight;
    }

    async function aiAnswer(text) {
      const cmd37 = aiTryCommand37(text);
      if (cmd37) return cmd37;
      const calc37 = aiTryCalculator37(text);
      if (calc37) { aiLastAnswer37 = calc37; aiLastFacts37 = []; return calc37; }
      const talk37 = aiTrySmallTalk37(text);
      if (talk37) { aiLastAnswer37 = talk37; aiLastFacts37 = []; return talk37; }
      if (/викторин/i.test(text)) {
        let round = null;
        try { round = await window.aiGenerateQuizQuestions(); } catch (e) { round = null; }
        if (Array.isArray(round) && round.length) {
          aiStartQuizFromTutor(round);
          return 'Готово! Я собрал свежий раунд из ' + round.length + ' вопросов и уже открыл его во вкладке «🎮 Игровая Лицея 37» 🎯 Удачи, ' + aiName() + '!';
        }
      }
      const urlMatch = text.match(/https?:\/\/[^\s]+/);
      if (urlMatch) {
        if (typeof fetch !== 'function') return 'Похоже, в этом браузере у меня нет доступа к сети 🙈 Но я всё равно здесь и готов помочь с учёбой!';
        try {
          const facts = await aiReadUrl(urlMatch[0]);
          if (facts.length) return aiComposeAnswer(text, facts.map(function (t) { return { s: 'web', t: t }; }));
        } catch (e) { /* упадём в заглушку ниже */ }
        return 'Хм, не смог открыть эту страницу 🙈 Проверь ссылку — или попробуй позже, иногда сайты закрыты от гостей.';
      }
      const kbQuery37 = (aiLastTopic37 && /^(продолжай|дальше|ещё|еще|подробнее|распиши|побольше|сделай таблицу|сравни|сделай файл|дай файлом)/i.test(String(text).trim())) ? aiLastTopic37 : text;
      await aiEnsureKb37(kbQuery37);
      aiLastReasoning37 = aiAnalyzeQuery37(text);
      const local = aiSearchKnowledge(text, 3);
      const keys37 = aiLastReasoning37 || [];
      let rel37 = 1;
      if (keys37.length && local.length) {
        let bestRel37 = -1;
        let bestIdx37 = 0;
        for (let li37 = 0; li37 < local.length; li37++) {
          const lowLi37 = String(local[li37].t || '').toLowerCase();
          let relHits37 = 0;
          keys37.forEach(function (k) {
            if (lowLi37.indexOf(k.w) !== -1 || (k.stem.length >= 4 && lowLi37.indexOf(k.stem) !== -1)) relHits37++;
          });
          const relLi37 = relHits37 / keys37.length;
          if (relLi37 > bestRel37) { bestRel37 = relLi37; bestIdx37 = li37; }
        }
        rel37 = bestRel37;
        if (bestIdx37 > 0) { const top37 = local.splice(bestIdx37, 1)[0]; local.unshift(top37); }
      }
      const topT37 = local.length ? String(local[0].t || '') : '';
      const schoolQ37 = /лицей/i.test(text);
      const cover37 = local.length && keys37.length ? Math.min(1, 0.6 + 0.4 * (local.length / 3)) : null;
      const composeLocal37 = function () {
        const composed37 = aiReasoningLine37(cover37) + aiComposeAnswer(text, local);
        aiLastAnswer37 = composed37;
        aiLastFacts37 = local.slice();
        aiShownFacts37 = local.length;
        aiLastTopic37 = text.slice(0, 80);
        return composed37;
      };
      const strongLocal37 = schoolQ37 || (topT37.length >= 180 && rel37 >= 0.6) || (rel37 >= 0.99 && topT37.length >= 140);
      if (local.length && strongLocal37) return composeLocal37();
      if (typeof fetch === 'function') {
        const wiki37 = await aiWikiAnswer37(text);
        if (wiki37) {
          if (local.length) {
            const combined37 = composeLocal37() + '\n\n📚 Подробнее из энциклопедии\n\n' + wiki37;
            aiLastAnswer37 = combined37;
            return combined37;
          }
          const wikiMsg37 = (!aiGreeted ? aiPick(AI_HI).replace('{name}', aiName()) + ' ' : '')
            + 'В моей базе точного ответа не нашлось, поэтому я заглянул в энциклопедию 🔍\n\n' + wiki37;
          aiLastAnswer37 = wikiMsg37;
          aiLastFacts37 = [{ s: 'wikipedia', t: wiki37 }];
          aiShownFacts37 = 1;
          aiLastTopic37 = text.slice(0, 80);
          return wikiMsg37;
        }
        if (local.length) return composeLocal37();
        const web = await aiWebSearch(text);
        if (web.length) {
          aiLastFacts37 = web.map(function (w) { return { s: 'web', t: w }; });
          aiShownFacts37 = aiLastFacts37.length;
          const intro = aiReasoningLine37(null) + (!aiGreeted ? aiPick(AI_HI).replace('{name}', aiName()) + ' ' : '');
          const body = web.slice(0, 3).map(function (w, i) {
            return (i === 0 ? 'Вот главное: ' : aiPick(AI_LINK)) + w.replace(/\s+/g, ' ').trim();
          }).join(' ');
          return intro + 'В моей базе точного ответа не нашлось, поэтому я поискал в интернете 🔎 ' + body + ' ' + aiPick(AI_TAIL);
        }
      }
      return aiPick(AI_DUNNO);
    }

    async function aiSend() {
      const inp = document.getElementById('ai-input');
      const text = inp.value.trim();
      if (!text || aiBusy) return;
      inp.value = '';
      aiGreeted = true;
      aiPushMsg('user', text);
      aiRememberUser(text);
      aiBusy = true;
      aiPushMsg('bot', aiPick(AI_THINK));
      let answer;
      try {
        answer = await aiAnswer(text);
      } catch (e) {
        answer = 'Ой, что-то пошло не так 🙈 Попробуй спросить ещё раз!';
      }
      aiChat = aiChat.filter(function (m) { return m.who !== 'bot' || AI_THINK.indexOf(m.t) === -1; });
      aiPushMsg('bot', answer);
      aiBusy = false;
    }

    function aiToggle(force) {
      const win = document.getElementById('ai-window');
      const fab = document.getElementById('ai-fab');
      const open = force !== undefined ? force : win.style.display !== 'flex';
      win.style.display = open ? 'flex' : 'none';
      fab.style.display = open ? 'none' : 'flex';
      if (open && !aiGreeted) {
        aiGreeted = true;
        const u = getCurrentUser();
        let hello = aiPick(AI_HI).replace('{name}', aiName());
        if (u) hello += ' Я вижу, ты из ' + classIdOf(u.grade, u.letter) + ' класса — здорово!';
        hello += ' Я — ИИ-Наставник Лицея №37 🤖 Могу рассказать о школе, Нижнекамске и Татарстане, помочь с Python, физикой и математикой, найти информацию в интернете и сгенерировать викторину. Спроси что-нибудь! 😊';
        aiPushMsg('bot', hello);
      }
      if (open) {
        renderAiMsgs();
        setTimeout(function () { document.getElementById('ai-input').focus(); }, 100);
      }
    }

    try {
  document.getElementById('ai-fab').addEventListener('click', function (e) {
        e.stopPropagation();
        aiToggle(true);
      });
} catch (errInit37) { try { console.error("Инициализация модуля:", errInit37); } catch (eI37) {} }
    try {
  document.getElementById('ai-close-btn').addEventListener('click', function (e) {
        e.stopPropagation();
        aiToggle(false);
      });
} catch (errInit37) { try { console.error("Инициализация модуля:", errInit37); } catch (eI37) {} }
    try {
  document.getElementById('ai-memory-btn').addEventListener('click', function (e) {
        e.stopPropagation();
        aiShowMemoryCard();
      });
} catch (errInit37) { try { console.error("Инициализация модуля:", errInit37); } catch (eI37) {} }
    try {
  document.getElementById('ai-send').addEventListener('click', function () { aiSend(); });
} catch (errInit37) { try { console.error("Инициализация модуля:", errInit37); } catch (eI37) {} }
    try {
  document.getElementById('ai-input').addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); aiSend(); }
      });
} catch (errInit37) { try { console.error("Инициализация модуля:", errInit37); } catch (eI37) {} }
    try {
  document.querySelectorAll('.ai-chips [data-chip]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          document.getElementById('ai-input').value = btn.getAttribute('data-chip');
          aiSend();
        });
      });
} catch (errInit37) { try { console.error("Инициализация модуля:", errInit37); } catch (eI37) {} }
    try {
  document.addEventListener('click', function (e) {
        const win = document.getElementById('ai-window');
        if (win.style.display !== 'flex') return;
        if (win.contains(e.target) || document.getElementById('ai-fab').contains(e.target)) return;
        aiToggle(false);
      });
} catch (errInit37) { try { console.error("Инициализация модуля:", errInit37); } catch (eI37) {} }

    function initAiTutor() {
      updateAiStatus();
      aiLoadFiles();
    }


    /* ============ ЧАСТЬ 1.5: ДВИЖОК ЖИВОГО ОБЩЕНИЯ (b2.txt) И КОМАНД УПРАВЛЕНИЯ ============ */
    let aiLastAnswer37 = '';
    let aiLastFacts37 = [];
    let aiShownFacts37 = 0;
    let aiLastTopic37 = '';
    let aiRules37 = [];

    function aiLoadRules37(text) {
      const rules = [];
      let cur = null;
      String(text || '').split('\n').forEach(function (rawLine) {
        const line = rawLine.trim();
        if (!line || line.charAt(0) === '#') return;
        if (line.indexOf('@rule ') === 0) {
          cur = { id: line.slice(6).trim(), match: [], say: [], action: '' };
          rules.push(cur);
          return;
        }
        if (!cur) return;
        if (line.indexOf('@match ') === 0) {
          line.slice(7).split('|').forEach(function (m) { const s = m.trim().toLowerCase(); if (s) cur.match.push(s); });
        } else if (line.indexOf('@action ') === 0) {
          cur.action = line.slice(8).trim().toLowerCase();
        } else if (line.indexOf('@say ') === 0) {
          line.slice(5).split('||').forEach(function (s) { const v = s.trim(); if (v) cur.say.push(v); });
        }
      });
      aiRules37 = rules;
    }

    function aiRuleFill37(tpl) {
      return String(tpl).replace(/\{name\}/g, aiName()).replace(/\{last_topic\}/g, aiLastTopic37 || 'учёба');
    }

    function aiRuleHits37(rule, lowText) {
      for (let i = 0; i < rule.match.length; i++) {
        if (lowText.indexOf(rule.match[i]) !== -1) return true;
      }
      return false;
    }

    function aiRulesFind37(lowText, withAction) {
      for (let i = 0; i < aiRules37.length; i++) {
        const r = aiRules37[i];
        if ((withAction && !r.action) || (!withAction && r.action)) continue;
        if (aiRuleHits37(r, lowText)) return r;
      }
      return null;
    }

    function aiPlain37(md) {
      return String(md || '')
        .replace(/\u0000CODE\d+\u0001/g, ' ')
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/\[\[[^\]]+\]\]/g, ' ')
        .replace(/\|/g, ' ')
        .replace(/\$\$([^$]+)\$\$/g, '$1')
        .replace(/\*\*([^*\n]+)\*\*/g, '$1')
        .replace(/`([^`\n]+)`/g, '$1')
        .replace(/^#{1,4}\s+/gm, '')
        .replace(/^-\s+/gm, '')
        .replace(/^[💡⚠️✅❗]\s*/gm, '')
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    }

    function aiTryCommand37(text) {
      const rule = aiRulesFind37(String(text).toLowerCase(), true);
      if (!rule) return '';
      const topic = aiLastTopic37 || (function () {
        for (let i = aiChat.length - 1; i >= 0; i--) { if (aiChat[i].who === 'user') return aiChat[i].t; }
        return '';
      })();
      if (rule.action === 'continue') {
        const all = aiSearchKnowledge(topic || 'лицей', 8);
        const fresh = all.slice(aiShownFacts37, aiShownFacts37 + 3);
        if (!fresh.length) {
          return aiRuleFill37(rule.say.length ? aiPick(rule.say) : 'По теме «' + topic + '» я рассказал всё, что знаю 📚 Давай новую тему — что разбираем?');
        }
        aiShownFacts37 += fresh.length;
        const parts = [aiRuleFill37(rule.say.length ? aiPick(rule.say) : 'Продолжаю 👇')];
        fresh.forEach(function (f) { parts.push('- ' + String(f.t).replace(/\s+/g, ' ').trim()); });
        return parts.join('\n');
      }
      if (rule.action === 'stop') {
        aiShownFacts37 = 0;
        return aiRuleFill37(rule.say.length ? aiPick(rule.say) : 'Хорошо, остановились 🙂 Какую тему разобрать следующей?');
      }
      if (rule.action === 'short') {
        const plain = aiPlain37(aiLastAnswer37);
        if (!plain) return 'Пока нечего сокращать 🙂 Задай вопрос — и я отвечу, а «покороче» всегда готов!';
        const sentences = plain.split(/(?<=[.!?])\s+/).filter(Boolean);
        return '💡 Запомни' + '\n' + sentences.slice(0, 3).map(function (s) { return '- **' + s.trim() + '**'; }).join('\n');
      }
      if (rule.action === 'more') {
        const all = aiSearchKnowledge(topic || 'учёба', 6);
        if (!all.length) return 'Хм, по «' + topic + '» подробностей не нашлось 🤔 Спроси по-другому или назови тему точнее!';
        aiShownFacts37 = Math.min(all.length, 6);
        const parts = ['Подробно по теме **' + topic + '** 📖'];
        all.forEach(function (f, i) { parts.push('Шаг ' + (i + 1) + ': ' + String(f.t).replace(/\s+/g, ' ').trim()); });
        return parts.join('\n');
      }
      if (rule.action === 'table') {
        const facts = aiLastFacts37.length ? aiLastFacts37 : aiSearchKnowledge(topic || 'лицей', 4);
        if (!facts.length) return 'Для таблицы нужен вопрос по теме 🙂 Спроси что-нибудь — и сделаю «сделай таблицу»!';
        let out = '| № | Факт |\n|---|---|\n';
        facts.forEach(function (f, i) { out += '| ' + (i + 1) + ' | ' + aiPlain37(f.t).replace(/[|]/g, '/') + ' |\n'; });
        return out;
      }
      if (rule.action === 'file') {
        const plain = aiPlain37(aiLastAnswer37) || aiPlain37(aiLastFacts37.map(function (f) { return f.t; }).join('. '));
        if (!plain) return 'Пока нечего сохранять 🙂 Сначала задай вопрос, потом скажи «сделай файл».';
        return 'Готово! Файл с ответом 👇\n[[file:ответ-наставника.txt|' + plain.replace(/\]\]/g, ']]') + ']]';
      }
      return '';
    }

    function aiTrySmallTalk37(text) {
      const rule = aiRulesFind37(String(text).toLowerCase(), false);
      if (!rule || !rule.say.length) return '';
      return aiRuleFill37(aiPick(rule.say));
    }


    /* ============ ЧАСТЬ 1.6: УМНЫЙ КАЛЬКУЛЯТОР И РЕШАТЕЛЬ ЗАДАЧ (без eval) ============ */
    function aiCalcTokenize37(src) {
      const tokens = [];
      let i = 0;
      const s = String(src);
      while (i < s.length) {
        const c = s[i];
        if (/\s/.test(c)) { i++; continue; }
        if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(s[i + 1] || ''))) {
          let j = i;
          while (j < s.length && /[0-9.]/.test(s[j])) j++;
          tokens.push({ t: 'num', v: parseFloat(s.slice(i, j)) });
          i = j;
          continue;
        }
        if (/[a-zа-яё]/i.test(c)) {
          let j = i;
          while (j < s.length && /[a-zа-яё]/i.test(s[j])) j++;
          tokens.push({ t: 'fn', v: s.slice(i, j).toLowerCase() });
          i = j;
          continue;
        }
        if ('+-*/^%()'.indexOf(c) !== -1) { tokens.push({ t: c }); i++; continue; }
        if (c === '√') { tokens.push({ t: 'fn', v: 'sqrt' }); i++; continue; }
        if (c === 'π') { tokens.push({ t: 'num', v: Math.PI }); i++; continue; }
        return null;
      }
      return tokens;
    }

    function aiCalcEval37(tokens) {
      let pos = 0;
      function peek() { return tokens[pos]; }
      function next() { return tokens[pos++]; }
      function parseExpr() {
        let v = parseTerm();
        while (peek() && (peek().t === '+' || peek().t === '-')) {
          const op = next().t;
          const r = parseTerm();
          v = op === '+' ? v + r : v - r;
        }
        return v;
      }
      function parseTerm() {
        let v = parsePow();
        while (peek() && (peek().t === '*' || peek().t === '/' || peek().t === '%')) {
          const op = next().t;
          const r = parsePow();
          if (op === '*') v = v * r;
          else if (op === '/') { if (r === 0) throw new Error('division'); v = v / r; }
          else v = v % r;
        }
        return v;
      }
      function parsePow() {
        const base = parseUnary();
        if (peek() && peek().t === '^') { next(); return Math.pow(base, parsePow()); }
        return base;
      }
      function parseUnary() {
        if (peek() && peek().t === '-') { next(); return -parseUnary(); }
        if (peek() && peek().t === '+') { next(); return parseUnary(); }
        return parsePrimary();
      }
      function parsePrimary() {
        const tk = next();
        if (!tk) throw new Error('eof');
        if (tk.t === 'num') return tk.v;
        if (tk.t === '(') {
          const v = parseExpr();
          if (!peek() || next().t !== ')') throw new Error('paren');
          return v;
        }
        if (tk.t === 'fn') {
          if (tk.v === 'pi') return Math.PI;
          if (tk.v === 'e') return Math.E;
          const arg = parseUnary();
          if (tk.v === 'sqrt' || tk.v === 'корень') {
            if (arg < 0) throw new Error('sqrt');
            return Math.sqrt(arg);
          }
          if (tk.v === 'abs') return Math.abs(arg);
          if (tk.v === 'sin') return Math.sin(arg);
          if (tk.v === 'cos') return Math.cos(arg);
          if (tk.v === 'tg' || tk.v === 'tan') return Math.tan(arg);
          if (tk.v === 'log') return Math.log10(arg);
          if (tk.v === 'ln') return Math.log(arg);
          throw new Error('fn');
        }
        throw new Error('token');
      }
      const result = parseExpr();
      if (pos !== tokens.length) throw new Error('tail');
      return result;
    }

    function aiCalcNormalize37(text) {
      return String(text || '')
        .toLowerCase()
        .replace(/,/g, '.')
        .replace(/[×хx](?=\s*\d)|[×x](?=\s*\()/g, '*')
        .replace(/÷/g, '/')
        .replace(/−|–/g, '-')
        .replace(/х/g, '*')
        .replace(/²/g, '^2')
        .replace(/³/g, '^3')
        .replace(/(\d)\s*%\s*от\s*/g, '($1/100)*')
        .replace(/(?:сколько будет|вычисли|посчитай|реши пример|найди значение|чему равно)\s*/g, '')
        .replace(/[=?]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }

    function aiCalcIsExpression37(s) {
      if (!s || s.length > 120) return false;
      if (!/[0-9]/.test(s)) return false;
      if (/[a-zа-яё]/i.test(s.replace(/sqrt|корень|sin|cos|tg|log|ln|pi|abs/g, ''))) return false;
      if (!/[+\-*/^%√]|sqrt|корень/.test(s)) return false;
      return /^[0-9+\-*/^%().\s√a-z]+$/i.test(s);
    }

    function aiCalcFmt37(n) {
      if (!isFinite(n)) return String(n);
      const r = Math.round(n * 1e10) / 1e10;
      return String(r).replace('.', ',');
    }

    function aiCalcSolveExpression37(expr) {
      try {
        const tokens = aiCalcTokenize37(expr);
        if (!tokens || !tokens.length) return '';
        const value = aiCalcEval37(tokens);
        if (typeof value !== 'number' || isNaN(value)) return '';
        let out = '🧮 **Считаю по шагам:**\n';
        out += 'Шаг 1: выражение — `' + expr + '`\n';
        out += 'Шаг 2: порядок действий — сначала скобки и степени, потом умножение и деление, затем сложение и вычитание.\n';
        out += '✅ Правило\n' + expr + ' = **' + aiCalcFmt37(value) + '**';
        return out;
      } catch (e) { return ''; }
    }

    function aiCalcQuadratic37(text) {
      const low = String(text).toLowerCase().replace(/\s+/g, ' ');
      if (!/x\^?2|x²/.test(low) || low.indexOf('=') === -1) return '';
      if (!/уравнен|реши|корни|дискриминант|квадратн/.test(low) && !/x\^?2\s*[+\-]/.test(low)) return '';
      const eq = low.replace(/уравнение|реши|квадратное|уравнен[а-яё]*|[:;]/g, ' ').replace(/[?]/g, '').trim();
      const sides = eq.split('=');
      if (sides.length !== 2) return '';
      const move = sides[1].trim();
      let expr = sides[0].trim();
      if (move && move !== '0') {
        expr = expr + ' - (' + move + ')';
      }
      expr = expr.replace(/−|–/g, '-').replace(/,(\d)/g, '.$1').replace(/x²/g, 'x^2');
      let a = 0, b = 0, c = 0;
      const re = /([+\-]?\s*\d*\.?\d*)\s*\*?\s*(x\^2|x)\b|([+\-]?\s*\d+\.?\d*)(?!\s*\*?\s*x)/g;
      let m;
      const seen2 = low.indexOf('x^2') !== -1 || low.indexOf('x²') !== -1;
      const flat = expr.replace(/\s+/g, '');
      const parts = flat.match(/[+\-]?[^+\-]+/g) || [];
      parts.forEach(function (p) {
        p = p.trim();
        if (/x\^2/.test(p)) { const n = parseFloat(p.replace(/x\^2/, '').replace(/\*$/, '')) || 1; a += n; }
        else if (/x$/.test(p) || /x\*/.test(p) || p === 'x') { const n = parseFloat(p.replace(/x$/, '').replace(/\*$/, '')) || 1; b += n; }
        else { const n = parseFloat(p); if (!isNaN(n)) c += n; }
      });
      if (!seen2 || Math.abs(a) < 1e-12) return '';
      const d = b * b - 4 * a * c;
      let out = '🧾 **Квадратное уравнение:** ' + low.replace(/[?]+$/, '') + '\n';
      out += 'Шаг 1: коэффициенты — a = ' + aiCalcFmt37(a) + ', b = ' + aiCalcFmt37(b) + ', c = ' + aiCalcFmt37(c) + '\n';
      out += 'Шаг 2: дискриминант D = b² − 4ac = ' + aiCalcFmt37(b) + '² − 4·' + aiCalcFmt37(a) + '·' + aiCalcFmt37(c) + ' = **' + aiCalcFmt37(d) + '**\n';
      if (d < 0) {
        out += '⚠️ Важно\nD < 0 — действительных корней нет.';
        return out;
      }
      const sq = Math.sqrt(d);
      const x1 = (-b + sq) / (2 * a);
      const x2 = (-b - sq) / (2 * a);
      out += 'Шаг 3: корни — x = (−b ± √D) / 2a.\n';
      if (Math.abs(d) < 1e-12) {
        out += '✅ Правило\nD = 0 — один корень: x = **' + aiCalcFmt37(x1) + '**';
      } else {
        out += '✅ Правило\nx₁ = **' + aiCalcFmt37(x1) + '**, x₂ = **' + aiCalcFmt37(x2) + '**';
      }
      return out;
    }

    function aiCalcBase37(text) {
      const low = String(text).toLowerCase().replace(/\s+/g, ' ').replace(/[!?]/g, '').trim();
      const names = { 'двоичн': 2, 'бинарн': 2, 'восьмеричн': 8, 'десятичн': 10, 'шестнадцатеричн': 16, 'шестнадцат': 16 };
      let target = 0;
      let source = 10;
      const mSys = low.match(/в\s*(\d{1,2})\s*[-—]?\s*(?:ую|ю|й|ую систему|систему)?/) || low.match(/в\s*систему\s*(?:счисления\s*)?(\d{1,2})/);
      if (mSys) { target = parseInt(mSys[1], 10); }
      else {
        for (const key in names) { if (low.indexOf(key) !== -1) { target = names[key]; break; } }
      }
      if (!target || [2, 8, 10, 16].indexOf(target) === -1) return '';
      if (!/перевед|перевести|в\s*(?:двоичн|восьмер|десят|шестнадц)|систем\w* счисл/.test(low)) return '';
      const numMatch = low.match(/\b(0x[0-9a-f]+|0b[01]+|0o[0-7]+|[0-9a-f]+)\b/i);
      if (!numMatch) return '';
      let raw = numMatch[1].toLowerCase();
      if (raw.indexOf('0x') === 0) { source = 16; raw = raw.slice(2); }
      else if (raw.indexOf('0b') === 0) { source = 2; raw = raw.slice(2); }
      else if (raw.indexOf('0o') === 0) { source = 8; raw = raw.slice(2); }
      else {
        const srcMatch = low.match(/из\s*(?:системы\s*)?(\d{1,2})/);
        if (srcMatch) source = parseInt(srcMatch[1], 10);
        else if (/[a-f]/.test(raw)) source = 16;
      }
      const dec = parseInt(raw, source);
      if (isNaN(dec)) return '';
      const digits = '0123456789ABCDEF';
      let out = '🔢 **Перевод числа:** ' + raw + (source !== 10 ? ' (из ' + source + '-й)' : '') + ' → ' + target + '-я система счисления\n';
      let n = dec;
      if (source !== 10) {
        out += 'Шаг 1: разложу по степеням основания ' + source + ': ' + raw.split('').reverse().map(function (d, i) { return d + '·' + source + '^' + i; }).reverse().join(' + ') + ' = **' + dec + '**₁₀\n';
      } else {
        out += 'Шаг 1: исходное число в десятичной — ' + dec + '\n';
      }
      if (target === 10) {
        out += '✅ Правило\nОтвет: ' + raw + '₁' + source + ' = **' + dec + '**₁₀';
        return out;
      }
      const steps = [];
      while (n > 0) { steps.push(n + ' ÷ ' + target + ' = ' + Math.floor(n / target) + ', остаток ' + digits[n % target]); n = Math.floor(n / target); }
      if (!steps.length) steps.push('0 — остаток 0');
      out += 'Шаг 2: делю с остатком на ' + target + ' и собираю остатки снизу вверх:\n';
      steps.slice(0, 8).forEach(function (s, i) { out += (i === 0 ? '' : '') + '- ' + s + '\n'; });
      const converted = dec.toString(target).toUpperCase();
      out += '✅ Правило\n' + raw + (source !== 10 ? '₁' + source : '') + ' = **' + converted + '**₁' + target;
      return out;
    }

    function aiCalcPercent37(text) {
      const low = String(text).toLowerCase().replace(',', '.');
      let m = low.match(/(\d+(?:\.\d+)?)\s*%\s*от\s*(\d+(?:\.\d+)?)/);
      if (m) {
        const p = parseFloat(m[1]), v = parseFloat(m[2]);
        return '🧮 **Проценты**\nШаг 1: ' + p + '% — это ' + p + '/100 = ' + aiCalcFmt37(p / 100) + '\nШаг 2: умножаю на число: ' + aiCalcFmt37(p / 100) + ' · ' + v + '\n✅ Правило\n' + p + '% от ' + v + ' = **' + aiCalcFmt37(p * v / 100) + '**';
      }
      m = low.match(/сколько\s+(?:процентов|%)\s+(?:составляет|составляет)\s*(\d+(?:\.\d+)?)\s*от\s*(\d+(?:\.\d+)?)/);
      if (m) {
        const a = parseFloat(m[1]), b = parseFloat(m[2]);
        if (!b) return '';
        return '🧮 **Процентное отношение**\nШаг 1: делим ' + a + ' на ' + b + ' = ' + aiCalcFmt37(a / b) + '\nШаг 2: умножаем на 100\n✅ Правило\n' + a + ' от ' + b + ' = **' + aiCalcFmt37(a / b * 100) + '%**';
      }
      return '';
    }

    function aiTryCalculator37(text) {
      try {
        const percent = aiCalcPercent37(text);
        if (percent) return percent;
        const quad = aiCalcQuadratic37(text);
        if (quad) return quad;
        const base = aiCalcBase37(text);
        if (base) return base;
        const norm = aiCalcNormalize37(text);
        if (aiCalcIsExpression37(norm)) {
          const res = aiCalcSolveExpression37(norm);
          if (res) return res;
        }
      } catch (eC37) { /* тихо */ }
      return '';
    }


    /* ============ ЧАСТЬ 1.7: ВИЗУАЛЬНЫЙ РЕНДЕР «КАК У GOOGLE» (v4) ============ */
    const aiCsvStore37 = [];
    const aiFileStore37 = [];

    function aiCsvDownload37(idx) {
      try {
        const csv = '\uFEFF' + (aiCsvStore37[Number(idx)] || '');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'таблица-наставника.csv';
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { try { URL.revokeObjectURL(a.href); a.remove(); } catch (e37) {} }, 800);
      } catch (eCsv37) {}
    }

    function aiFileDownload37(idx) {
      try {
        const f = aiFileStore37[Number(idx)] || {};
        const extMime = { txt: 'text/plain', csv: 'text/csv', py: 'text/x-python', cpp: 'text/plain', html: 'text/html', js: 'text/javascript', md: 'text/markdown' };
        const ext = String(f.name || 'файл.txt').split('.').pop().toLowerCase();
        const blob = new Blob([f.content || ''], { type: (extMime[ext] || 'text/plain') + ';charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = f.name || 'файл.txt';
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { try { URL.revokeObjectURL(a.href); a.remove(); } catch (e37) {} }, 800);
      } catch (eF37) {}
    }

    function aiHl37(html) {
      try {
        html = html.replace(/(\b1[0-9]{3}\b|\b20[0-4][0-9]\b|\b\d{1,3}(?:[.,]\d+)?\s?(?:%|км|кг|м\/с|мл|г|мм|см|мк|Н|Дж|Вт|В|Ом|°C|°С|л)\b)/g, '<mark class="ai-hl">$1</mark>');
        html = html.replace(/(^|\n|\()([A-ZА-ЯЁ][a-zа-яё-]{2,20}(?:\s[a-zа-яё-]{2,20}){0,2})(\s+—)/g, '$1<mark class="ai-hl">$2</mark>$3');
        return html;
      } catch (eHl37) { return html; }
    }

    function aiMdRender37(raw) {
      try {
        let text = String(raw == null ? '' : raw);
        aiCsvStore37.length = 0;
        aiFileStore37.length = 0;
        text = text.replace(/```file:([^\n]+)\n?([\s\S]*?)```/g, function (_, name, content) {
          aiFileStore37.push({ name: name.trim(), content: String(content).replace(/\n$/, '') });
          return '\u0000FILE' + (aiFileStore37.length - 1) + '\u0001';
        });
        text = text.replace(/```[a-zA-Z]*\n?([\s\S]*?)```/g, function (_, code) {
          let idx = aiCodeStore37.indexOf(code);
          if (idx === -1) { aiCodeStore37.push(code); idx = aiCodeStore37.length - 1; }
          return '\u0000CODE' + idx + '\u0001';
        });
        text = text.replace(/\[\[file:([^|\]]+)\|([\s\S]*?)\]\]/g, function (_, name, content) {
          aiFileStore37.push({ name: name.trim(), content: content });
          return '\u0000FILE' + (aiFileStore37.length - 1) + '\u0001';
        });
        let html = esc(text);
        html = html.replace(/\[\[spo:([^|\]]+)\|([\s\S]*?)\]\]/g, function (_, title, body) {
          return '<details class="ai-spoiler"><summary>👁️ ' + title.trim() + '</summary><div class="ai-spoiler-body">' + body.trim() + '</div></details>';
        });
        html = html.replace(/\[\[tab:([a-z]+)\|([^\]]+)\]\]/g, '<button class="ai-nav-card" data-ai-nav="$1">$2 →</button>');
        html = html.replace(/\$\$([^$]+)\$\$/g, '<div class="ai-formula-card">$1</div>');
        html = html.replace(/^### (.+)$/gm, '<h4>$1</h4>').replace(/^## (.+)$/gm, '<h4>$1</h4>');
        const lines = html.split('\n');
        const out = [];
        let i = 0;
        while (i < lines.length) {
          const line = lines[i];
          const trimmed = line.trim();
          if (trimmed.charAt(0) === '|' && trimmed.charAt(trimmed.length - 1) === '|') {
            const rows = [];
            while (i < lines.length && lines[i].trim().charAt(0) === '|') {
              rows.push(lines[i].trim());
              i++;
            }
            const cells = rows.filter(function (r) { return !/^\|[\s:\-|]+\|$/.test(r); }).map(function (r) {
              return r.replace(/^\|/, '').replace(/\|$/, '').split('|').map(function (c) { return c.trim(); });
            });
            if (cells.length) {
              const csv = cells.map(function (r) { return r.map(function (c) { return '"' + c.replace(/"/g, '""') + '"'; }).join(';'); }).join('\r\n');
              aiCsvStore37.push(csv);
              const idx = aiCsvStore37.length - 1;
              let t = '<div class="ai-table-wrap"><button class="ai-csv-btn" data-ai-csv="' + idx + '">📊 Скачать в Excel (.csv)</button><table class="ai-table">';
              cells.forEach(function (r, ri) {
                t += '<tr>' + r.map(function (c) { return (ri === 0 ? '<th>' : '<td>') + c + (ri === 0 ? '</th>' : '</td>'); }).join('') + '</tr>';
              });
              t += '</table></div>';
              out.push(t);
            }
            continue;
          }
          const callout = trimmed.match(/^(💡|⚠️|✅|❗)\s*(.*)$/);
          if (callout) {
            const cls = callout[1] === '💡' ? 'tip' : (callout[1] === '✅' ? 'rule' : 'warn');
            let body = callout[2];
            const bullet = [];
            while (i + 1 < lines.length && /^-\s/.test(lines[i + 1].trim())) {
              i++;
              bullet.push(lines[i].trim().replace(/^-\s*/, ''));
            }
            if (bullet.length) body += bullet.map(function (b) { return '<div class="ai-li">• ' + b + '</div>'; }).join('');
            out.push('<div class="ai-callout ' + cls + '"><span class="ai-callout-ico">' + callout[1] + '</span><span>' + body + '</span></div>');
            i++;
            continue;
          }
          if (/^Шаг\s*\d+[:.]?\s*/.test(trimmed)) {
            const steps = [];
            while (i < lines.length && /^Шаг\s*\d+[:.]?\s*/.test(lines[i].trim())) {
              const sm = lines[i].trim().match(/^(Шаг\s*\d+)[:.]?\s*(.*)$/);
              steps.push({ n: sm[1], v: sm[2] });
              i++;
            }
            let s = '<div class="ai-steps">';
            steps.forEach(function (st) {
              s += '<div class="ai-step"><span class="ai-step-num">' + st.n + '</span><div class="ai-step-body">' + st.v + '</div></div>';
            });
            s += '</div>';
            out.push(s);
            continue;
          }
          const versus = trimmed.match(/^(.{1,120}?)\s+⇄\s+(.{1,120})$/);
          if (versus) {
            out.push('<div class="ai-versus"><div class="ai-versus-col">' + versus[1] + '</div><div class="ai-versus-col">' + versus[2] + '</div></div>');
            i++;
            continue;
          }
          if (/^\u0000FILE\d+\u0001$/.test(trimmed)) { out.push(trimmed); i++; continue; }
          if (/^\u0000CODE\d+\u0001$/.test(trimmed)) { out.push(trimmed); i++; continue; }
          if (trimmed === '') { i++; continue; }
          out.push(trimmed);
          i++;
        }
        html = out.join('<br>');
        html = html.replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>');
        html = html.replace(/`([^`\n]+)`/g, '<code class="ai-inline-code">$1</code>');
        html = html.replace(/^- (.+)$/gm, '<div class="ai-li">• $1</div>');
        html = aiHl37(html);
        html = html.replace(/\u0000CODE(\d+)\u0001/g, function (_, idx) {
          const code = aiCodeStore37[Number(idx)] || '';
          return '<div class="ai-code-wrap"><button class="ai-copy-code" data-ai-code="' + idx + '">📋 Копировать</button><pre><code>' + pyHighlight37(code) + '</code></pre></div>';
        });
        html = html.replace(/\u0000FILE(\d+)\u0001/g, function (_, idx) {
          const f = aiFileStore37[Number(idx)] || { name: 'файл.txt', content: '' };
          const kb = (f.content.length / 1024).toFixed(1);
          return '<div class="ai-file-card"><span class="ai-file-ico">📄</span><span class="ai-file-name">' + esc(f.name) + '<small>' + kb + ' КБ · ' + esc(String(f.name).split('.').pop().toUpperCase()) + '</small></span><button class="ai-file-btn" data-ai-file="' + idx + '">📥 Скачать файл</button></div>';
        });
        return html;
      } catch (eMd37) { return esc(raw); }
    }

    (function aiInjectStyles37() {
      try {
        if (document.getElementById('ai-engine-styles37')) return;
        const st = document.createElement('style');
        st.id = 'ai-engine-styles37';
        st.textContent = ''
          + '.ai-table-wrap { margin: 10px 0; overflow-x: auto; border: 1px solid var(--border); border-radius: 14px; background: var(--card); }'
          + '.ai-table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }'
          + '.ai-table th, .ai-table td { padding: 8px 11px; border-bottom: 1px solid var(--border); text-align: left; word-break: break-word; }'
          + '.ai-table th { background: rgba(16,185,129,.10); font-weight: 800; white-space: nowrap; }'
          + '.ai-table tr:last-child td { border-bottom: none; }'
          + '.ai-csv-btn, .ai-file-btn { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--border); background: var(--bg); color: var(--text); font-weight: 700; font-size: 0.68rem; padding: 6px 11px; border-radius: 999px; cursor: pointer; transition: border-color .15s, transform .15s; }'
          + '.ai-csv-btn:hover, .ai-file-btn:hover { border-color: #059669; transform: translateY(-1px); }'
          + '.ai-callout { display: flex; gap: 9px; align-items: flex-start; margin: 9px 0; padding: 10px 13px; border-radius: 14px; font-size: 0.82rem; line-height: 1.5; border: 1px solid; }'
          + '.ai-callout.tip { background: color-mix(in srgb, #f59e0b 10%, var(--card)); border-color: #f59e0b; }'
          + '.ai-callout.warn { background: color-mix(in srgb, #ef4444 9%, var(--card)); border-color: #ef4444; }'
          + '.ai-callout.rule { background: color-mix(in srgb, #10b981 9%, var(--card)); border-color: #10b981; }'
          + '.ai-callout-ico { flex-shrink: 0; font-size: 1rem; }'
          + 'mark.ai-hl { background: rgba(250,204,21,.35); color: inherit; border-radius: 4px; padding: 0 3px; font-weight: 700; }'
          + '.ai-steps { display: flex; flex-direction: column; gap: 8px; margin: 10px 0; }'
          + '.ai-step { display: flex; gap: 10px; align-items: flex-start; background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 9px 12px; }'
          + '.ai-step-num { flex-shrink: 0; font-weight: 800; font-size: 0.66rem; color: #fff; background: linear-gradient(135deg,#059669,#10b981); border-radius: 999px; padding: 3px 10px; margin-top: 1px; white-space: nowrap; }'
          + '.ai-step-body { font-size: 0.82rem; line-height: 1.5; }'
          + '.ai-versus { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 10px 0; }'
          + '.ai-versus-col { background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 10px 12px; font-size: 0.8rem; line-height: 1.45; }'
          + '.ai-versus-col:first-child { border-left: 3px solid #6366f1; }'
          + '.ai-versus-col:last-child { border-left: 3px solid #f59e0b; }'
          + 'details.ai-spoiler { margin: 9px 0; border: 1px dashed var(--border); border-radius: 14px; background: var(--card); overflow: hidden; }'
          + 'details.ai-spoiler summary { cursor: pointer; font-weight: 700; font-size: 0.8rem; padding: 9px 13px; user-select: none; list-style: none; }'
          + 'details.ai-spoiler summary::-webkit-details-marker { display: none; }'
          + 'details.ai-spoiler[open] summary { border-bottom: 1px solid var(--border); }'
          + '.ai-spoiler-body { padding: 10px 13px; font-size: 0.82rem; line-height: 1.55; }'
          + '.ai-file-card { display: flex; align-items: center; gap: 10px; margin: 10px 0; padding: 11px 13px; border: 1px solid var(--border); border-radius: 14px; background: var(--card); }'
          + '.ai-file-ico { font-size: 1.3rem; flex-shrink: 0; }'
          + '.ai-file-name { flex: 1; min-width: 0; font-weight: 700; font-size: 0.8rem; display: flex; flex-direction: column; gap: 1px; }'
          + '.ai-file-name small { font-weight: 600; opacity: .6; font-size: 0.66rem; }'
          + '.ai-msg .ai-body > br:first-child { display: none; }';
        document.head.appendChild(st);
      } catch (eCss37) {}
    })();

    /* ============ ЧАСТЬ 2: ПРЕМИУМ-ОБОЛОЧКА ИИ-НАСТАВНИКА 37 (v3.7 Neural Engine) ============ */
    const aiCodeStore37 = [];
    let aiRenderLock37 = false;
    let aiUserScrolled37 = false;
    let aiStopGen37 = false;

    function pyHighlight37(code) {
      try {
        let s = esc(code);
        const stash = [];
        s = s.replace(/#[^\n<]*/g, function (m) { stash.push(m); return '\uE000' + String.fromCharCode(0xE100 + stash.length - 1) + '\uE000'; });
        s = s.replace(/(&quot;[^&]*?&quot;|&#39;[^&]*?&#39;)/g, function (m) { stash.push(m); return '\uE000' + String.fromCharCode(0xE100 + stash.length - 1) + '\uE000'; });
        s = s.replace(/\b(def|class|if|elif|else|for|while|return|import|from|in|not|and|or|True|False|None|print|range|len|int|str|float|input|break|continue|try|except|lambda|with|as|pass)\b/g, '<span class="tk-kw">$1</span>');
        s = s.replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="tk-num">$1</span>');
        s = s.replace(/\uE000(.)\uE000/g, function (_, ch) {
          const i = ch.charCodeAt(0) - 0xE100;
          const cls = /^#/.test(stash[i] || '') ? 'tk-com' : 'tk-str';
          return '<span class="' + cls + '">' + stash[i] + '</span>';
        });
        return s;
      } catch (ePh37) { return esc(code); }
    }

    function aiMsgMeta37(m) {
      try {
        let badge = '';
        if (m.who === 'bot') {
          badge = m.mode === 'web' ? '<span class="ai-mode-badge web">🌐 Веб-ридер</span>'
            : (m.mode === 'solve' ? '<span class="ai-mode-badge solve">🧮 Решатель</span>'
              : '<span class="ai-mode-badge">💬 Диалог</span>');
        }
        return '<div class="ai-meta">' + badge + '<span class="ai-time">' + localClock(m.ts) + '</span></div>';
      } catch (eMm37) { return ''; }
    }

    function aiSources37(m) {
      try {
        if (!m || m.who !== 'bot' || !m.t) return '';
        const urls = String(m.t).match(/https?:\/\/[^\s)"'<>]+/g);
        if (!urls || !urls.length) return '';
        const chips = urls.slice(0, 3).map(function (u) {
          let host = u;
          try { host = new URL(u).hostname.replace(/^www\./, ''); } catch (eH37) {}
          return '<span class="ai-src-chip" title="' + esc(u) + '">🔗 ' + esc(host) + '</span>';
        }).join('');
        return '<div class="ai-src-chips">' + chips + '</div>';
      } catch (eSrc37) { return ''; }
    }

    function aiActions37(m, isLast) {
      try {
        return '';
      } catch (eAc37) { return ''; }
    }

    function aiNav37(text) {
      try {
        const t = String(text || '').toLowerCase();
        if (/барахолк|лицей-маркет|лимаркет|продам|куплю|объявлен/.test(t)) return '[[tab:market|🛍️ Перейти в Лицей-Маркет]]\n';
        if (/звонк|расписан/.test(t)) return '[[tab:home|⏰ Открыть расписание звонков]]\n';
        if (/питом|талисман|мой класс/.test(t)) return '[[tab:class|🐾 Мой класс]]\n';
        if (/викторин|игр/.test(t)) return '[[tab:games|🎮 Игровая Лицея 37]]\n';
        return '';
      } catch (eNv37) { return ''; }
    }

    function aiMode37(text) {
      const t = String(text || '');
      if (/https?:\/\//.test(t)) return 'web';
      if (/реши|уравнен|вычисл|задач|пример|сколько будет/i.test(t)) return 'solve';
      return 'dialog';
    }

    function aiAutoScroll37() {
      try {
        const wrap = document.getElementById('ai-msgs');
        if (!wrap || aiUserScrolled37) return;
        wrap.scrollTop = wrap.scrollHeight;
      } catch (eAs37) {}
    }

    function renderAiMsgsPolish37() {
      const wrap = document.getElementById('ai-msgs');
      if (!wrap || aiRenderLock37) return;
      if (!aiChat.length) {
        const u = getCurrentUser();
        wrap.innerHTML = '<div class="ai-welcome"><div class="aw-logo">🤖</div><h3>ИИ-Наставник 37</h3><p>Привет' + (u ? ', ' + esc(u.name) : '') + '! Я помогу с учёбой, расскажу о Лицее №37, найду информацию в интернете и сгенерирую викторину. Напиши вопрос или выбери подсказку ниже 👇</p></div>';
        return;
      }
      let lastUserIdx = -1, lastBotIdx = -1;
      for (let i = aiChat.length - 1; i >= 0; i--) {
        if (lastUserIdx === -1 && aiChat[i].who === 'user') lastUserIdx = i;
        if (lastBotIdx === -1 && aiChat[i].who === 'bot') lastBotIdx = i;
        if (lastUserIdx !== -1 && lastBotIdx !== -1) break;
      }
      let lastTs = 0;
      wrap.innerHTML = aiChat.map(function (m, i) {
        let html = '';
        if (m.ts - lastTs > 30 * 60 * 1000) html += '<div class="ai-msg-sep">' + localClock(m.ts) + '</div>';
        lastTs = m.ts;
        if (m.who === 'user') {
          html += '<div class="ai-msg user">' + esc(m.t) +
            (i === lastUserIdx ? '<button class="ai-retry-btn" data-ai-retry="' + esc(m.t) + '">↻ Повторить</button>' : '') +
            '</div>';
        } else {
          html += '<div class="ai-msg bot">' + aiMsgMeta37(m) + '<div class="ai-body">' + aiMdRender37(m.t) + '</div>' + aiSources37(m) + aiActions37(m, i === lastBotIdx) + '</div>';
        }
        return html;
      }).join('');
      aiAutoScroll37();
    }
    const renderAiMsgsBase37 = renderAiMsgs;
    renderAiMsgs = renderAiMsgsPolish37;
    window.renderAiMsgs = renderAiMsgs;

    function aiType37(msg) {
      return new Promise(function (resolve) {
        const wrap = document.getElementById('ai-msgs');
        if (!wrap) { resolve(); return; }
        aiRenderLock37 = true;
        const bubble = document.createElement('div');
        bubble.className = 'ai-msg bot';
        bubble.innerHTML = aiMsgMeta37(msg) + '<div class="ai-body"><span class="ai-type-target"></span><span class="ai-cursor">▍</span></div>';
        wrap.appendChild(bubble);
        const stopBtn = document.createElement('button');
        stopBtn.className = 'ai-stop-btn';
        stopBtn.textContent = '⏹ Остановить генерацию';
        wrap.appendChild(stopBtn);
        stopBtn.addEventListener('click', function () { aiStopGen37 = true; });
        const target = bubble.querySelector('.ai-type-target');
        const full = String(msg.t || '');
        let pos = 0;
        try {
          if (typeof bubble.scrollIntoView === 'function') bubble.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } catch (eSv37) { try { bubble.scrollIntoView(); } catch (eSv237) {} }
        const iv = setInterval(function () {
          try {
            if (aiStopGen37) pos = full.length;
            pos = Math.min(full.length, pos + 5);
            if (target) target.innerHTML = aiMdRender37(full.slice(0, pos));
            if (pos >= full.length) {
              clearInterval(iv);
              try { stopBtn.remove(); } catch (eSr37) {}
              bubble.innerHTML = aiMsgMeta37(msg) + '<div class="ai-body">' + aiMdRender37(msg.t) + '</div>' + aiSources37(msg) + aiActions37(msg, true);
              aiRenderLock37 = false;
              renderAiMsgs();
              resolve();
            }
          } catch (eTw37) {
            clearInterval(iv);
            aiRenderLock37 = false;
            try { renderAiMsgs(); } catch (e37) {}
            resolve();
          }
        }, 20);
      });
    }

    let thoughtsEl37 = null, aiThoughtTimers37 = [], aiThoughtStopwatch37 = null, aiThoughtStart37 = 0;
    function aiAddStep37(text) {
      try {
        if (!thoughtsEl37) return;
        const body = thoughtsEl37.querySelector('.ai-th-steps');
        if (!body) return;
        const step = document.createElement('div');
        step.className = 'th-step';
        step.textContent = text;
        body.appendChild(step);
      } catch (eSt37) {}
    }
    function startThoughts37() {
      try {
        const wrap = document.getElementById('ai-msgs');
        if (!wrap) return;
        const el = document.createElement('div');
        el.className = 'ai-thoughts open';
        el.innerHTML = '<button class="ai-thoughts-head"><span class="ai-neuro-dot"></span>🧠 Ход мыслей ИИ-Наставника<span class="ai-thoughts-time">Думаю... 0.0 сек</span></button><div class="ai-thoughts-body"><div class="ai-th-steps"></div><div class="ai-progress"><div class="ai-progress-fill" style="width:4%"></div></div></div>';
        wrap.appendChild(el);
        thoughtsEl37 = el;
        aiAutoScroll37();
        aiThoughtStart37 = Date.now();
        aiAddStep37('🔍 Ищу в базе знаний Лицея №37...');
        aiThoughtTimers37.push(setTimeout(function () { aiAddStep37('⚙️ Анализирую запрос...'); }, 800));
        aiThoughtTimers37.push(setTimeout(function () { aiAddStep37('✨ Синтезирую ответ...'); }, 1600));
        aiThoughtStopwatch37 = setInterval(function () {
          try {
            const t = (Date.now() - aiThoughtStart37) / 1000;
            const tl = el.querySelector('.ai-thoughts-time');
            const fill = el.querySelector('.ai-progress-fill');
            if (tl) tl.textContent = 'Думаю... ' + t.toFixed(1) + ' сек';
            if (fill) fill.style.width = Math.min(96, 4 + t * 22) + '%';
          } catch (eSw37) {}
        }, 100);
      } catch (eTs37) {}
    }
    function finishThoughts37(silent) {
      try {
        aiThoughtTimers37.forEach(function (t) { clearTimeout(t); });
        aiThoughtTimers37 = [];
        if (aiThoughtStopwatch37) { clearInterval(aiThoughtStopwatch37); aiThoughtStopwatch37 = null; }
        const el = thoughtsEl37;
        thoughtsEl37 = null;
        if (!el) return;
        const t = ((Date.now() - aiThoughtStart37) / 1000).toFixed(1);
        const tl = el.querySelector('.ai-thoughts-time');
        const fill = el.querySelector('.ai-progress-fill');
        if (tl) tl.textContent = 'Рассуждал ' + t + ' сек';
        if (fill) fill.style.width = '100%';
        if (!silent) setTimeout(function () { try { el.classList.remove('open'); } catch (e37) {} }, 1200);
      } catch (eFt37) {}
    }

    function setAiHeadStatus37(text, busy) {
      try {
        const el = document.getElementById('ai-head-status');
        if (el) el.textContent = text;
        const sb = document.getElementById('ai-send');
        if (sb) sb.classList.toggle('busy', !!busy);
      } catch (eSh37) {}
    }
    function completionFeedback37() {
      try {
        if (typeof isDndActive37 === 'function' && !isDndActive37()) toast('✅ ИИ-Наставник закончил ответ.', 'success');
      } catch (eCf37) {}
    }
    function autoGrowAiInput37() {
      try {
        const inp = document.getElementById('ai-input');
        if (!inp) return;
        inp.style.height = 'auto';
        inp.style.height = Math.min(110, inp.scrollHeight) + 'px';
      } catch (eAg37) {}
    }
    function updateAiClearBtn37() {
      try {
        const inp = document.getElementById('ai-input');
        const btn = document.getElementById('ai-clear-input');
        if (btn) btn.style.display = (inp && inp.value.length > 0) ? 'flex' : 'none';
      } catch (eUc37) {}
    }
    function persistAiState37() {
      try {
        const inp = document.getElementById('ai-input');
        const wrap = document.getElementById('ai-msgs');
        const st = polishLsGet('ai_state', {});
        if (inp) st.draft = inp.value;
        if (wrap) st.scroll = wrap.scrollTop;
        polishLsSet('ai_state', st);
      } catch (ePs37) {}
    }
    function restoreAiState37() {
      try {
        const st = polishLsGet('ai_state', {});
        const inp = document.getElementById('ai-input');
        const wrap = document.getElementById('ai-msgs');
        if (inp && st.draft) inp.value = st.draft;
        updateAiClearBtn37();
        autoGrowAiInput37();
        if (wrap && typeof st.scroll === 'number') setTimeout(function () { try { wrap.scrollTop = st.scroll; } catch (e37) {} }, 0);
      } catch (eRs37) {}
    }

    async function aiSendPolish37() {
      const inp = document.getElementById('ai-input');
      if (!inp) return;
      const text = inp.value.trim();
      if (!text || aiBusy) return;
      inp.value = '';
      autoGrowAiInput37();
      updateAiClearBtn37();
      try {
        const st = polishLsGet('ai_state', {});
        st.draft = '';
        polishLsSet('ai_state', st);
      } catch (eDr37) {}
      aiUserScrolled37 = false;
      aiGreeted = true;
      aiChat.push({ who: 'user', t: text, ts: Date.now() });
      if (aiChat.length > 22) aiChat = aiChat.slice(-22);
      try { aiRememberUser(text); } catch (eRm37) {}
      aiBusy = true;
      aiStopGen37 = false;
      setAiHeadStatus37('🧠 Думаю...', true);
      renderAiMsgs();
      startThoughts37();
      let answer;
      try { answer = await aiAnswer(text); }
      catch (eAn37) { answer = 'Ой, что-то пошло не так 🙈 Попробуй спросить ещё раз — я на связи!'; }
      finishThoughts37();
      aiChat = aiChat.filter(function (m) { return m.who !== 'bot' || AI_THINK.indexOf(m.t) === -1; });
      aiBusy = false;
      setAiHeadStatus37('● Готов помочь', false);
      if (aiStopGen37) { renderAiMsgs(); completionFeedback37(); return; }
      const nav = aiNav37(text);
      const msg = { who: 'bot', t: nav + answer, ts: Date.now(), mode: aiMode37(text), rating: 0 };
      aiChat.push(msg);
      if (aiChat.length > 22) aiChat = aiChat.slice(-22);
      await aiType37(msg);
      completionFeedback37();
    }
    const aiSendBase37 = aiSend;
    aiSend = aiSendPolish37;

    const aiToggleBase37 = aiToggle;
    function aiTogglePolish37(force) {
      const win = document.getElementById('ai-window');
      const fab = document.getElementById('ai-fab');
      if (!win || !fab) { try { aiToggleBase37(force); } catch (eTb37) {} return; }
      const open = force !== undefined ? force : win.style.display !== 'flex';
      if (open) {
        win.style.display = 'flex';
        fab.style.display = 'none';
        if (!aiGreeted) {
          aiGreeted = true;
          const u = getCurrentUser();
          let hello = aiPick(AI_HI).replace('{name}', aiName());
          if (u) hello += ' Я вижу, ты из ' + classIdOf(u.grade, u.letter) + ' класса — здорово!';
          hello += ' Я — ИИ-Наставник Лицея №37 🤖 Могу рассказать о школе, Нижнекамске и Татарстане, помочь с Python, физикой и математикой, найти информацию в интернете и сгенерировать викторину. Спроси что-нибудь! 😊';
          aiChat.push({ who: 'bot', t: hello, ts: Date.now(), mode: 'dialog', rating: 0 });
          if (aiChat.length > 22) aiChat = aiChat.slice(-22);
        }
        restoreAiState37();
        renderAiMsgs();
        setTimeout(function () { try { const i = document.getElementById('ai-input'); if (i) i.focus(); } catch (e37) {} }, 100);
      } else {
        persistAiState37();
        win.style.display = 'none';
        fab.style.display = 'flex';
      }
    }
    aiToggle = aiTogglePolish37;

    const updateAiStatusBase37 = updateAiStatus;
    function updateAiStatusPolish37() {
      try { updateAiStatusBase37(); } catch (eUs37) {}
      try {
        const el = document.getElementById('ai-db-badge');
        if (el) el.textContent = (typeof aiLoadedFiles === 'number' && aiLoadedFiles > 0)
          ? '📚 База знаний: активна (' + aiLoadedFiles + ' файлов)'
          : '📚 База знаний: загружается...';
      } catch (eUb37) {}
    }
    updateAiStatus = updateAiStatusPolish37;

    (function initAI37() {
      try {
        const msgs = document.getElementById('ai-msgs');
        if (msgs && !msgs.dataset.aiBound37) {
          msgs.dataset.aiBound37 = '1';
          msgs.addEventListener('scroll', function () {
            try {
              const nearBottom = msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight < 120;
              aiUserScrolled37 = !nearBottom;
              const jb = document.getElementById('ai-jump-end');
              if (jb) jb.style.display = aiUserScrolled37 ? 'flex' : 'none';
            } catch (eSc37) {}
          });
          msgs.addEventListener('click', function (e) {
            try {
              const csvBtn = e.target.closest('[data-ai-csv]');
              if (csvBtn) { aiCsvDownload37(csvBtn.getAttribute('data-ai-csv')); return; }
              const fileBtn = e.target.closest('[data-ai-file]');
              if (fileBtn) { aiFileDownload37(fileBtn.getAttribute('data-ai-file')); return; }
              const codeBtn = e.target.closest('[data-ai-code]');
              if (codeBtn) {
                const idx = Number(codeBtn.getAttribute('data-ai-code'));
                try { copyTextToClipboard(aiCodeStore37[idx] || ''); } catch (eCc37) {}
                codeBtn.textContent = '✓ Скопировано';
                codeBtn.classList.add('ok');
                setTimeout(function () { try { codeBtn.textContent = '📋 Копировать код'; codeBtn.classList.remove('ok'); } catch (e37) {} }, 1600);
                return;
              }
              const copyBtn = e.target.closest('[data-ai-copy]');
              if (copyBtn) {
                const m = aiChat.filter(function (x) { return x.who === 'bot' && String(x.ts) === copyBtn.getAttribute('data-ai-copy'); })[0];
                if (m) { try { copyTextToClipboard(m.t); toast('📋 Ответ скопирован.', 'success'); } catch (e37) {} }
                return;
              }
              const rateBtn = e.target.closest('[data-ai-rate]');
              if (rateBtn) {
                const ts = rateBtn.getAttribute('data-ai-rate-ts');
                const dir = rateBtn.getAttribute('data-ai-rate');
                const m = aiChat.filter(function (x) { return x.who === 'bot' && String(x.ts) === ts; })[0];
                if (m) { m.rating = m.rating === dir ? 0 : dir; renderAiMsgs(); }
                return;
              }
              const quickBtn = e.target.closest('[data-ai-quick]');
              if (quickBtn) {
                const kind = quickBtn.getAttribute('data-ai-quick');
                let lastUser = '';
                for (let i = aiChat.length - 1; i >= 0; i--) { if (aiChat[i].who === 'user') { lastUser = aiChat[i].t; break; } }
                const inp = document.getElementById('ai-input');
                const prefix = kind === 'simple' ? '👶 Объясни проще: ' : (kind === 'cheat' ? '📝 Сделай шпаргалку по теме: ' : '🧠 Проверь меня по теме: ');
                if (inp) inp.value = prefix + lastUser;
                aiSend();
                return;
              }
              const retryBtn = e.target.closest('[data-ai-retry]');
              if (retryBtn) {
                const inp = document.getElementById('ai-input');
                if (inp) inp.value = retryBtn.getAttribute('data-ai-retry') || '';
                aiSend();
                return;
              }
              const navBtn = e.target.closest('[data-ai-nav]');
              if (navBtn) {
                aiToggle(false);
                setTab(navBtn.getAttribute('data-ai-nav'));
                return;
              }
              const th = e.target.closest('.ai-thoughts-head');
              if (th) {
                const box = th.closest('.ai-thoughts');
                if (box) box.classList.toggle('open');
              }
            } catch (eCl37) {}
          });
        }
      } catch (errAI37) { try { console.error('Инициализация модуля:', errAI37); } catch (eI37) {} }
      try {
        const inp = document.getElementById('ai-input');
        if (inp && !inp.dataset.aiBound37) {
          inp.dataset.aiBound37 = '1';
          inp.addEventListener('input', function () { try { autoGrowAiInput37(); updateAiClearBtn37(); } catch (e37) {} });
        }
      } catch (errAI37) { try { console.error('Инициализация модуля:', errAI37); } catch (eI37) {} }
      try {
        const clr = document.getElementById('ai-clear-btn');
        if (clr && !clr.dataset.aiBound37) {
          clr.dataset.aiBound37 = '1';
          clr.addEventListener('click', function (e) {
            e.stopPropagation();
            if (!confirm('Очистить диалог с ИИ-Наставником?')) return;
            aiChat = [];
            renderAiMsgs();
            toast('🧹 Диалог очищен.', 'info');
          });
        }
      } catch (errAI37) { try { console.error('Инициализация модуля:', errAI37); } catch (eI37) {} }
      try {
        const exp = document.getElementById('ai-expand-btn');
        if (exp && !exp.dataset.aiBound37) {
          exp.dataset.aiBound37 = '1';
          exp.addEventListener('click', function (e) {
            e.stopPropagation();
            const win = document.getElementById('ai-window');
            if (win) win.classList.toggle('ai37-full');
          });
        }
      } catch (errAI37) { try { console.error('Инициализация модуля:', errAI37); } catch (eI37) {} }
      try {
        const lbtn = document.getElementById('ai-link-btn');
        if (lbtn && !lbtn.dataset.aiBound37) {
          lbtn.dataset.aiBound37 = '1';
          lbtn.addEventListener('click', function (e) {
            e.stopPropagation();
            const url = prompt('Вставь ссылку, которую мне прочитать:', 'https://');
            if (!url) return;
            const inp = document.getElementById('ai-input');
            if (inp) { inp.value = (inp.value ? inp.value + ' ' : '') + url; autoGrowAiInput37(); updateAiClearBtn37(); inp.focus(); }
          });
        }
      } catch (errAI37) { try { console.error('Инициализация модуля:', errAI37); } catch (eI37) {} }
      try {
        const ci = document.getElementById('ai-clear-input');
        if (ci && !ci.dataset.aiBound37) {
          ci.dataset.aiBound37 = '1';
          ci.addEventListener('click', function (e) {
            e.stopPropagation();
            const inp = document.getElementById('ai-input');
            if (inp) { inp.value = ''; updateAiClearBtn37(); autoGrowAiInput37(); inp.focus(); }
          });
        }
      } catch (errAI37) { try { console.error('Инициализация модуля:', errAI37); } catch (eI37) {} }
      try {
        const je = document.getElementById('ai-jump-end');
        if (je && !je.dataset.aiBound37) {
          je.dataset.aiBound37 = '1';
          je.addEventListener('click', function (e) {
            e.stopPropagation();
            const wrap = document.getElementById('ai-msgs');
            aiUserScrolled37 = false;
            if (wrap) wrap.scrollTop = wrap.scrollHeight;
            je.style.display = 'none';
          });
        }
      } catch (errAI37) { try { console.error('Инициализация модуля:', errAI37); } catch (eI37) {} }
      try {
        document.addEventListener('keydown', function (e) {
          try {
            if (e.key !== 'Escape') return;
            const win = document.getElementById('ai-window');
            if (win && win.style.display === 'flex') aiToggle(false);
          } catch (eEs37) {}
        });
      } catch (errAI37) { try { console.error('Инициализация модуля:', errAI37); } catch (eI37) {} }
    })();


    /* ---- Самостоятельная инициализация (index.html больше не вызывает initAiTutor) ---- */
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { try { initAiTutor(); } catch (eIn37) {} });
    } else {
      try { initAiTutor(); } catch (eIn37) {}
    }
