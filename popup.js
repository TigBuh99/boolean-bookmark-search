// --- Normalisation helper ---
function cleanTerm(str) {
    return str
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/^[^\w]+|[^\w]+$/g, "") // strip leading/trailing punctuation
    .replace(/\s+/g, "")             // remove all whitespace variants
    .toLowerCase();
}

// --- Tokenizer ---
function tokenize(input) {
    const regex = /\s*(\(|\)|AND|OR|NOT|"[^"]+"|\S+)/gi;
    const tokens = [];
    let m;
    while ((m = regex.exec(input)) !== null) {
        let tok = m[1];
        if (/^".+"$/.test(tok)) tok = tok.slice(1, -1); // strip quotes
        tokens.push(tok);
    }
    return tokens;
}

// --- Parser (recursive descent) ---
function parseExpression(tokens) {
    let pos = 0;

    function peek() { return tokens[pos]; }
    function consume() { return tokens[pos++]; }

    function parseFactor() {
        if (peek() === "(") {
            consume();
            const expr = parseOr();
            if (peek() === ")") consume();
            return expr;
        } else if (peek() && peek().toUpperCase() === "NOT") {
            consume();
            return { type: "NOT", expr: parseFactor() };
        } else {
            const raw = consume();
            return { type: "TERM", value: cleanTerm(raw) };
        }
    }

    function parseAnd() {
        let node = parseFactor();
        while (peek() && peek().toUpperCase() === "AND") {
            consume();
            node = { type: "AND", left: node, right: parseFactor() };
        }
        return node;
    }

    function parseOr() {
        let node = parseAnd();
        while (peek() && peek().toUpperCase() === "OR") {
            consume();
            node = { type: "OR", left: node, right: parseAnd() };
        }
        return node;
    }

    return parseOr();
}

// --- Evaluator ---
function evalExpr(expr, wordSet) {
    switch (expr.type) {
        case "TERM":
            return wordSet.has(expr.value);
        case "NOT":
            return !evalExpr(expr.expr, wordSet);
        case "AND":
            return evalExpr(expr.left, wordSet) && evalExpr(expr.right, wordSet);
        case "OR":
            return evalExpr(expr.left, wordSet) || evalExpr(expr.right, wordSet);
    }
}

// --- Collect all terms for highlighting ---
function collectTerms(expr, terms = []) {
    if (!expr) return terms;
    switch (expr.type) {
        case "TERM":
            terms.push(expr.value);
            break;
        case "NOT":
            collectTerms(expr.expr, terms);
            break;
        case "AND":
        case "OR":
            collectTerms(expr.left, terms);
            collectTerms(expr.right, terms);
            break;
    }
    return terms;
}

// --- Main search ---
async function searchBookmarks() {
    const query = document.getElementById("query").value.trim();
    const tagsOnly = document.getElementById("tagsOnly").checked;
    const resultsEl = document.getElementById("results");
    resultsEl.innerHTML = "";

    if (!query) {
        resultsEl.textContent = "Please enter a search query.";
        return;
    }

    // Parse query into AST
    const tokens = tokenize(query);
    const ast = parseExpression(tokens);
    const allTerms = collectTerms(ast);

    // Gather bookmarks
    const traverse = (nodes, results = []) => {
        for (const n of nodes) {
            if (n.url) {
                results.push({
                    id: n.id,
                    title: n.title,
                    url: n.url,
                    description: n.description || ""
                });
            }
            if (n.children) traverse(n.children, results);
        }
        return results;
    };

    const tree = await chrome.bookmarks.getTree();
    const bookmarks = traverse(tree);

    const matches = [];

    // Evaluate each bookmark
    for (const b of bookmarks) {
        const desc = b.description || "";
        const wordSet = new Set();

        const items = desc.split(/[\s,;]+/);
        items.forEach(w => {
            if (!w) return;
            if (tagsOnly) {
                if (w.toLowerCase().startsWith("tag:")) {
                    const tag = cleanTerm(w.slice(4));
                    if (tag) wordSet.add(tag);
                }
            } else {
                wordSet.add(cleanTerm(w));
            }
        });

        if (evalExpr(ast, wordSet)) {
            matches.push({ ...b, wordSet });
        }
    }

    // Render results
    if (!matches.length) {
        resultsEl.textContent = "No matches found.";
        return;
    }

    resultsEl.innerHTML = `<b>${matches.length} matches:</b><br><br>`;

    matches.forEach(b => {
        const div = document.createElement("div");
        div.className = "result";

        const a = document.createElement("a");
        a.href = b.url;
        a.target = "_blank";
        a.title = b.url;
        a.textContent = b.title;
        div.appendChild(a);

        if (allTerms.length) {
            const span = document.createElement("span");
            span.innerHTML = " — terms: " + allTerms.map(term => {
                if (b.wordSet.has(term)) {
                    return `<b>${term}</b>`;
                } else {
                    return `<span style="color:#888;text-decoration:line-through;">${term}</span>`;
                }
            }).join(", ");
            div.appendChild(span);
        }

        resultsEl.appendChild(div);
    });
}

// --- Saved Searches ---
async function loadSavedSearches() {
    const { saved = [] } = await chrome.storage.local.get("saved");
    console.log("Loading saved searches:", saved); // 👈 debug
    renderSavedSearches(saved);
}

function renderSavedSearches(saved) {
    const container = document.getElementById("savedSearches");
    if (!container) {
        console.warn("No #savedSearches container found in DOM");
        return;
    }

    if (!saved.length) {
        container.innerHTML = "<b>Saved Searches:</b><br><i>(none yet)</i>";
        return;
    }

    container.innerHTML = "<b>Saved Searches:</b><br>";
    saved.forEach((s, idx) => {
        const div = document.createElement("div");
        div.className = "saved";

        const runBtn = document.createElement("button");
        runBtn.textContent = "▶";
        runBtn.addEventListener("click", () => {
            console.log("Re‑running saved search:", s);
            document.getElementById("query").value = s.query;
            document.getElementById("tagsOnly").checked = s.tagsOnly;
            searchBookmarks();
        });

        const delBtn = document.createElement("button");
        delBtn.textContent = "❌";
        delBtn.addEventListener("click", async () => {
            console.log("Deleting saved search:", s);
            const { saved = [] } = await chrome.storage.local.get("saved");
            saved.splice(idx, 1);
            await chrome.storage.local.set({ saved });
            renderSavedSearches(saved);
        });

        div.appendChild(runBtn);
        div.appendChild(document.createTextNode(" " + s.query));
        div.appendChild(delBtn);
        container.appendChild(div);
    });
}

const saveBtn = document.getElementById("save");
if (saveBtn) {
    saveBtn.addEventListener("click", async () => {
        const query = document.getElementById("query").value.trim();
        const tagsOnly = document.getElementById("tagsOnly").checked;
        if (!query) return;

        const { saved = [] } = await chrome.storage.local.get("saved");
        saved.unshift({ query, tagsOnly });
        await chrome.storage.local.set({ saved });
        console.log("Saved new search:", query, "tagsOnly:", tagsOnly);
        renderSavedSearches(saved);
    });
}

// Load saved searches when popup opens
loadSavedSearches();

document.getElementById("save").addEventListener("click", async () => {
    const query = document.getElementById("query").value.trim();
    const tagsOnly = document.getElementById("tagsOnly").checked;
    if (!query) return;

    const { saved = [] } = await chrome.storage.local.get("saved");

    // ✅ Deduplication: skip if this exact query + mode already exists
    const exists = saved.some(s => s.query === query && s.tagsOnly === tagsOnly);
    if (exists) {
        console.log("Search already saved, skipping duplicate:", query);
        return;
    }

    // ✅ Newest‑first ordering
    saved.unshift({ query, tagsOnly });

    await chrome.storage.local.set({ saved });
    renderSavedSearches(saved);
});

// Load saved searches when popup opens
loadSavedSearches();

// --- Event listeners ---
document.getElementById("run").addEventListener("click", searchBookmarks);

document.getElementById("query").addEventListener("keydown", e => {
    if (e.key === "Enter") {
        e.preventDefault();
        searchBookmarks();
    }
});

document.getElementById("clear").addEventListener("click", () => {
    document.getElementById("query").value = "";
    document.getElementById("results").innerHTML = "";
});
