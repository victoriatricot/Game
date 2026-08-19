const express = require("express");
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3001;

const JOKES_FILE = path.join(__dirname, "data", "jokes.json");
const THEMES_FILE = path.join(__dirname, "data", "themes.json");
const VOTE_THRESHOLD = 5; // nombre de votes nécessaires avant qu'une blague soit classée ou recalée
const DEFAULT_THEME_EMOJI = "🃏";

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Sérialise les écritures sur jokes.json pour éviter les écritures concurrentes qui s'écrasent
let writeQueue = Promise.resolve();
function queueWrite(jokes) {
  writeQueue = writeQueue.then(() =>
    fs.writeFile(JOKES_FILE, JSON.stringify(jokes, null, 2))
  );
  return writeQueue;
}

async function readJokes() {
  const raw = await fs.readFile(JOKES_FILE, "utf8");
  return JSON.parse(raw);
}

async function readThemes() {
  const raw = await fs.readFile(THEMES_FILE, "utf8");
  return JSON.parse(raw);
}

function score(joke) {
  return joke.votes.up - joke.votes.down;
}

function totalVotes(joke) {
  return joke.votes.up + joke.votes.down;
}

function statusOf(joke) {
  if (totalVotes(joke) < VOTE_THRESHOLD) return "pending";
  return score(joke) > 0 ? "ranked" : "rejected";
}

function toPublicJoke(joke) {
  return {
    id: joke.id,
    text: joke.text,
    author: joke.author || "Anonyme",
    theme: joke.theme,
    up: joke.votes.up,
    down: joke.votes.down,
    score: score(joke),
    total: totalVotes(joke),
    votesToDecision: Math.max(0, VOTE_THRESHOLD - totalVotes(joke)),
    status: statusOf(joke),
    createdAt: joke.createdAt,
  };
}

app.get("/api/themes", async (req, res) => {
  const [themes, jokes] = await Promise.all([readThemes(), readJokes()]);
  const counts = {};
  for (const joke of jokes) {
    counts[joke.theme] = (counts[joke.theme] || 0) + 1;
  }

  const known = new Set(themes.map((t) => t.name));
  const merged = themes.map((t) => ({ ...t, count: counts[t.name] || 0 }));

  // Ajoute les thèmes créés à la volée par les utilisateurs et absents de la liste canonique
  for (const name of Object.keys(counts)) {
    if (!known.has(name)) {
      merged.push({ name, emoji: DEFAULT_THEME_EMOJI, count: counts[name] });
    }
  }

  res.json(merged);
});

app.get("/api/jokes", async (req, res) => {
  const { theme, status } = req.query;
  let jokes = await readJokes();

  if (theme) jokes = jokes.filter((j) => j.theme === theme);

  let result = jokes.map(toPublicJoke);

  if (status && status !== "all") {
    result = result.filter((j) => j.status === status);
  }

  if (!status || status === "ranked" || status === "all") {
    // tri par défaut pertinent pour le classement : meilleur score d'abord
  }

  result.sort((a, b) => {
    if (a.status === "ranked" && b.status === "ranked") {
      if (b.score !== a.score) return b.score - a.score;
      return b.up - a.up;
    }
    if (a.status === "pending" && b.status === "pending") {
      if (a.votesToDecision !== b.votesToDecision) {
        return a.votesToDecision - b.votesToDecision; // les plus proches d'un verdict d'abord
      }
      return new Date(b.createdAt) - new Date(a.createdAt);
    }
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  res.json(result);
});

app.post("/api/jokes", async (req, res) => {
  const { text, author, theme } = req.body || {};

  if (typeof text !== "string" || text.trim().length < 5) {
    return res.status(400).json({ error: "La blague doit faire au moins 5 caractères." });
  }
  if (text.trim().length > 500) {
    return res.status(400).json({ error: "La blague est trop longue (500 caractères max)." });
  }
  if (typeof theme !== "string" || theme.trim().length === 0) {
    return res.status(400).json({ error: "Un thème est requis." });
  }

  const jokes = await readJokes();
  const joke = {
    id: "j-" + crypto.randomUUID(),
    text: text.trim(),
    author: (author || "").trim() || "Anonyme",
    theme: theme.trim().slice(0, 40),
    votes: { up: 0, down: 0 },
    voters: {},
    createdAt: new Date().toISOString(),
  };

  jokes.push(joke);
  await queueWrite(jokes);

  res.status(201).json(toPublicJoke(joke));
});

app.post("/api/jokes/:id/vote", async (req, res) => {
  const { id } = req.params;
  const { direction, voterId } = req.body || {};

  if (!["up", "down"].includes(direction)) {
    return res.status(400).json({ error: "direction doit être 'up' ou 'down'." });
  }
  if (typeof voterId !== "string" || voterId.length < 8) {
    return res.status(400).json({ error: "voterId manquant ou invalide." });
  }

  const jokes = await readJokes();
  const joke = jokes.find((j) => j.id === id);
  if (!joke) return res.status(404).json({ error: "Blague introuvable." });

  const previous = joke.voters[voterId];

  if (previous === direction) {
    // Cliquer à nouveau sur le même bouton retire le vote
    joke.votes[direction] -= 1;
    delete joke.voters[voterId];
  } else {
    if (previous) joke.votes[previous] -= 1;
    joke.votes[direction] += 1;
    joke.voters[voterId] = direction;
  }

  await queueWrite(jokes);

  res.json({ ...toPublicJoke(joke), myVote: joke.voters[voterId] || null });
});

app.get("/healthz", (req, res) => res.json({ status: "ok" }));

app.listen(PORT, () => {
  console.log(`Blagues de Darons dispo sur http://localhost:${PORT}`);
});
