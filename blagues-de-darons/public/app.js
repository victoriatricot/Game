(() => {
  const state = {
    tab: "ranked",
    theme: null, // null = tous les thèmes
    themes: [],
  };

  const voterId = getOrCreateVoterId();

  function getOrCreateVoterId() {
    let id = localStorage.getItem("blagues-voter-id");
    if (!id) {
      id = (crypto.randomUUID ? crypto.randomUUID() : "voter-" + Math.random().toString(36).slice(2) + Date.now());
      localStorage.setItem("blagues-voter-id", id);
    }
    return id;
  }

  const myVotes = JSON.parse(localStorage.getItem("blagues-my-votes") || "{}");
  function rememberVote(jokeId, direction) {
    if (direction) myVotes[jokeId] = direction;
    else delete myVotes[jokeId];
    localStorage.setItem("blagues-my-votes", JSON.stringify(myVotes));
  }

  const tabs = document.querySelectorAll(".tab");
  const panels = document.querySelectorAll(".panel");
  const themeFilter = document.getElementById("theme-filter");
  const themeChips = document.getElementById("theme-chips");

  tabs.forEach((btn) => {
    btn.addEventListener("click", () => {
      tabs.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.tab = btn.dataset.tab;
      panels.forEach((p) => p.classList.remove("active"));
      document.getElementById("panel-" + state.tab).classList.add("active");
      themeFilter.style.display = state.tab === "add" ? "none" : "flex";
      if (state.tab !== "add") loadJokes();
    });
  });

  async function loadThemes() {
    const res = await fetch("/api/themes");
    state.themes = await res.json();
    renderThemeChips();
    renderThemeSelect();
  }

  function renderThemeChips() {
    themeChips.innerHTML = "";
    const all = document.createElement("button");
    all.className = "chip" + (state.theme === null ? " active" : "");
    all.textContent = "Tous";
    all.addEventListener("click", () => selectTheme(null));
    themeChips.appendChild(all);

    for (const t of state.themes) {
      const chip = document.createElement("button");
      chip.className = "chip" + (state.theme === t.name ? " active" : "");
      chip.textContent = `${t.emoji} ${t.name} (${t.count})`;
      chip.addEventListener("click", () => selectTheme(t.name));
      themeChips.appendChild(chip);
    }
  }

  function selectTheme(name) {
    state.theme = name;
    renderThemeChips();
    loadJokes();
  }

  function renderThemeSelect() {
    const select = document.getElementById("joke-theme");
    select.innerHTML = "";
    for (const t of state.themes) {
      const opt = document.createElement("option");
      opt.value = t.name;
      opt.textContent = `${t.emoji} ${t.name}`;
      select.appendChild(opt);
    }
    const other = document.createElement("option");
    other.value = "__other__";
    other.textContent = "✨ Autre…";
    select.appendChild(other);

    const customInput = document.getElementById("joke-theme-custom");
    select.addEventListener("change", () => {
      customInput.hidden = select.value !== "__other__";
      if (!customInput.hidden) customInput.focus();
    });
  }

  async function loadJokes() {
    const params = new URLSearchParams();
    params.set("status", state.tab);
    if (state.theme) params.set("theme", state.theme);

    const res = await fetch("/api/jokes?" + params.toString());
    const jokes = await res.json();
    renderJokes(jokes);
  }

  function renderJokes(jokes) {
    const list = document.getElementById("list-" + state.tab);
    list.innerHTML = "";

    if (jokes.length === 0) {
      const empty = document.createElement("li");
      empty.className = "empty-state";
      empty.textContent = emptyMessage();
      list.appendChild(empty);
      return;
    }

    jokes.forEach((joke, index) => {
      list.appendChild(renderJokeCard(joke, index));
    });
  }

  function emptyMessage() {
    if (state.tab === "ranked") return "Pas encore de blague classée dans ce thème. Votez pour en faire émerger une !";
    if (state.tab === "pending") return "Aucune blague en attente de verdict ici pour le moment.";
    return "Personne n'a encore été recalé ici, c'est plutôt bon signe.";
  }

  function renderJokeCard(joke, index) {
    const li = document.createElement("li");
    li.className = "joke-card";

    const rank = document.createElement("div");
    rank.className = "joke-rank";
    rank.textContent = state.tab === "ranked" ? rankLabel(index) : (state.tab === "pending" ? "🗳️" : "🪦");
    li.appendChild(rank);

    const body = document.createElement("div");
    body.className = "joke-body";

    const text = document.createElement("p");
    text.className = "joke-text";
    text.textContent = joke.text;
    body.appendChild(text);

    const meta = document.createElement("div");
    meta.className = "joke-meta";
    meta.innerHTML = `<span class="joke-theme-tag">${escapeHtml(joke.theme)}</span><span>par ${escapeHtml(joke.author)}</span>`;
    body.appendChild(meta);

    if (state.tab === "pending") {
      const track = document.createElement("div");
      track.className = "progress-track";
      const fill = document.createElement("div");
      fill.className = "progress-fill";
      const pct = Math.min(100, Math.round((joke.total / (joke.total + joke.votesToDecision || 1)) * 100));
      fill.style.width = pct + "%";
      track.appendChild(fill);
      body.appendChild(track);

      const hint = document.createElement("div");
      hint.className = "joke-meta";
      hint.style.marginTop = "0.3rem";
      hint.textContent = joke.votesToDecision > 0
        ? `Encore ${joke.votesToDecision} vote(s) avant le verdict`
        : "Verdict en cours de calcul...";
      body.appendChild(hint);
    }

    li.appendChild(body);
    li.appendChild(renderVoteBox(joke));
    return li;
  }

  function rankLabel(index) {
    if (index === 0) return "🥇";
    if (index === 1) return "🥈";
    if (index === 2) return "🥉";
    return "#" + (index + 1);
  }

  function renderVoteBox(joke) {
    const box = document.createElement("div");
    box.className = "vote-box";

    const upBtn = document.createElement("button");
    upBtn.className = "vote-btn";
    upBtn.textContent = "👍";
    upBtn.title = "Excellente blague";
    if (myVotes[joke.id] === "up") upBtn.classList.add("voted-up");

    const scoreEl = document.createElement("span");
    scoreEl.className = "vote-score";
    scoreEl.textContent = joke.score;

    const downBtn = document.createElement("button");
    downBtn.className = "vote-btn";
    downBtn.textContent = "👎";
    downBtn.title = "Trop lourde";
    if (myVotes[joke.id] === "down") downBtn.classList.add("voted-down");

    upBtn.addEventListener("click", () => vote(joke.id, "up"));
    downBtn.addEventListener("click", () => vote(joke.id, "down"));

    box.appendChild(upBtn);
    box.appendChild(scoreEl);
    box.appendChild(downBtn);
    return box;
  }

  async function vote(jokeId, direction) {
    try {
      const res = await fetch(`/api/jokes/${jokeId}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direction, voterId }),
      });
      if (!res.ok) throw new Error("Vote refusé");
      const updated = await res.json();
      rememberVote(jokeId, updated.myVote);
      // Le statut de la blague peut changer d'onglet (pending -> ranked/rejected) : on recharge la liste courante
      loadJokes();
      loadThemes();
    } catch (err) {
      console.error(err);
    }
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  const addForm = document.getElementById("add-form");
  const formStatus = document.getElementById("form-status");

  addForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = document.getElementById("joke-text").value.trim();
    const select = document.getElementById("joke-theme");
    const customInput = document.getElementById("joke-theme-custom");
    const theme = select.value === "__other__" ? customInput.value.trim() : select.value;
    const author = document.getElementById("joke-author").value.trim();

    formStatus.textContent = "";
    formStatus.className = "form-status";

    if (!theme) {
      formStatus.textContent = "Merci de préciser un thème.";
      formStatus.className = "form-status error";
      return;
    }

    try {
      const res = await fetch("/api/jokes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, theme, author }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur inconnue");

      formStatus.textContent = "Blague envoyée au vote ! 🗳️";
      formStatus.className = "form-status ok";
      addForm.reset();
      customInput.hidden = true;
      await loadThemes();

      document.querySelector('.tab[data-tab="pending"]').click();
    } catch (err) {
      formStatus.textContent = err.message;
      formStatus.className = "form-status error";
    }
  });

  loadThemes().then(loadJokes);
})();
