// --- Normalisation helpers ---
function cleanText(str) {
    return (str || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}
function cleanTerm(str) {
    return (str || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/^[^\w]+|[^\w]+$/g, "")
    .toLowerCase();
}

// --- Tokenizer with explicit token types ---
function tokenize(input) {
    const tokens = [];
    const re = /\s*(\(|\)|"[^"]+"|AND|OR|NOT|[^\s()]+)/gi;
    let m;
    while ((m = re.exec(input)) !== null) {
        const raw = m[1];
        const upper = raw.toUpperCase();
        if (raw === "(") tokens.push({ type: "LPAREN", value: raw });
        else if (raw === ")") tokens.push({ type: "RPAREN", value: raw });
        else if (upper === "AND") tokens.push({ type: "AND", value: raw });
        else if (upper === "OR") tokens.push({ type: "OR", value: raw });
        else if (upper === "NOT") tokens.push({ type: "NOT", value: raw });
        else if (/^".+"$/.test(raw)) tokens.push({ type: "TERM", value: raw.slice(1, -1) });
        else tokens.push({ type: "TERM", value: raw });
    }
    return tokens;
}

// --- Parser with NOT precedence + implicit AND ---
function parseExpression(tokens) {
    let pos = 0;
    const peek = () => tokens[pos];
    const consume = () => tokens[pos++];

    function startsFactor(t) {
        return t && (t.type === "TERM" || t.type === "NOT" || t.type === "LPAREN");
    }

    function parsePrimary() {
        const t = peek();
        if (!t) return null;
        if (t.type === "LPAREN") {
            consume();
            const expr = parseOr();
            if (peek() && peek().type === "RPAREN") consume();
            return expr;
        }
        if (t.type === "TERM") {
            consume();
            return { type: "TERM", value: t.value };
        }
        consume(); // recover
        return null;
    }

    function parseNot() {
        if (peek() && peek().type === "NOT") {
            consume();
            return { type: "NOT", expr: parseNot() };
        }
        return parsePrimary();
    }

    function parseAnd() {
        let node = parseNot();
        while (peek() && peek().type === "AND") {
            consume();
            node = { type: "AND", left: node, right: parseNot() };
        }
        while (startsFactor(peek())) {
            node = { type: "AND", left: node, right: parseNot() };
        }
        return node;
    }

    function parseOr() {
        let node = parseAnd();
        while (peek() && peek().type === "OR") {
            consume();
            node = { type: "OR", left: node, right: parseAnd() };
        }
        return node;
    }

    return parseOr();
}

// --- Context builder (supports tagsOnly) ---
function makeContext(b, useRegexp, tagsOnly) {
    const title = b.title || "";
    const url = b.url || "";
    const desc = b.description || "";

    const combined = cleanText(`${title} ${url} ${desc}`);

    // Extract explicit tag: entries
    const tags = [];
    desc.split(/[\s,;]+/).forEach(w => {
        if (!w) return;
        if (w.toLowerCase().startsWith("tag:")) {
            const t = cleanText(w.slice(4));
            if (t) tags.push(t);
        }
    });
    const tagsText = tags.join(" ");
    const tagSet = new Set(tags);

    return { combined, tagsText, tagSet, useRegexp, tagsOnly };
}

// --- Term matching ---
function termMatches(term, ctx) {
    const { combined, tagsText, tagSet, useRegexp, tagsOnly } = ctx;
    const explicitRegex = term.startsWith("re:") || (term.startsWith("/") && term.endsWith("/"));
    const isRegex = useRegexp || explicitRegex;

    if (isRegex) {
        let pattern = term;
        if (pattern.startsWith("re:")) pattern = pattern.slice(3);
        if (pattern.startsWith("/") && pattern.endsWith("/")) pattern = pattern.slice(1, -1);
        if (!pattern) return false;
        try {
            const regex = new RegExp(pattern, "i");
            return tagsOnly ? regex.test(tagsText) : regex.test(combined);
        } catch {
            console.warn("Invalid regex pattern:", pattern);
            return false;
        }
    } else {
        const needle = cleanTerm(term);
        if (!needle) return false;
        return tagsOnly ? tagSet.has(needle) : combined.includes(needle);
    }
}

// --- Evaluator ---
function evalExpr(expr, context) {
    if (!expr) return false;
    switch (expr.type) {
        case "TERM": return termMatches(expr.value, context);
        case "NOT":  return !evalExpr(expr.expr, context);
        case "AND":  return evalExpr(expr.left, context) && evalExpr(expr.right, context);
        case "OR":   return evalExpr(expr.left, context) || evalExpr(expr.right, context);
        default:     return false;
    }
}

// --- Collect terms for display ---
function collectTerms(expr, terms = [], negated = false) {
    if (!expr) return terms;
    switch (expr.type) {
        case "TERM": {
            const raw = expr.value;
            const isRegex = raw.startsWith("re:") || (raw.startsWith("/") && raw.endsWith("/"));
            terms.push({ raw, kind: isRegex ? "regex" : "literal", negated });
            break;
        }
        case "NOT":
            collectTerms(expr.expr, terms, true);
            break;
        case "AND":
        case "OR":
            collectTerms(expr.left, terms, negated);
            collectTerms(expr.right, terms, negated);
            break;
    }
    return terms;
}

// --- Main search ---
async function searchBookmarks() {
    const query = document.getElementById("query").value.trim();
    const tagsOnly = !!document.getElementById("tagsOnly")?.checked;
    const useRegexp = !!document.getElementById("useRegexp")?.checked;
    const resultsEl = document.getElementById("results");
    resultsEl.innerHTML = "";

    if (!query) {
        resultsEl.textContent = "Please enter a search query.";
        return;
    }

    const tokens = tokenize(query);
    const ast = parseExpression(tokens);
    const allTerms = collectTerms(ast);

    const traverse = (nodes, results = []) => {
        for (const n of nodes) {
            if (n.url) {
                results.push({
                    id: n.id,
                    title: n.title || "",
                    url: n.url || "",
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

    for (const b of bookmarks) {
        const ctx = makeContext(b, useRegexp, tagsOnly);
        if (evalExpr(ast, ctx)) {
            matches.push({ ...b, _ctx: ctx });
        }
    }

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
        a.textContent = b.title || b.url;
        div.appendChild(a);

        if (allTerms.length) {
            const span = document.createElement("span");
            const matched = allTerms.filter(({ raw }) => termMatches(raw, b._ctx));
            if (matched.length) {
                span.innerHTML = " — terms: " + matched.map(({ raw, negated }) => {
                    return negated
                    ? `<span style="color:#c00;">NOT ${raw}</span>`
                    : `<b>${raw}</b>`;
                }).join(", ");
                div.appendChild(span);
            }
        }
        resultsEl.appendChild(div);
    });
}

// --- Saved Searches ---
async function loadSavedSearches() {
    const { saved = [] } = await chrome.storage.local.get("saved");
    renderSavedSearches(saved);
}
function renderSavedSearches(saved) {
    const container = document.getElementById("savedSearches");
    if (!container) return;

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
            document.getElementById("query").value = s.query;
            document.getElementById("tagsOnly").checked = !!s.tagsOnly;
            document.getElementById("useRegexp").checked = !!s.useRegexp;
            searchBookmarks();
        });

        const delBtn = document.createElement("button");
        delBtn.textContent = "❌";
        delBtn.addEventListener("click", async () => {
            const store = await chrome.storage.local.get("saved");
            const list = store.saved || [];
            list.splice(idx, 1);
            await chrome.storage.local.set({ saved: list });
            renderSavedSearches(list);
        });

        div.appendChild(runBtn);
        div.appendChild(document.createTextNode(" " + s.query));
        div.appendChild(delBtn);
        container.appendChild(div);
    });
}

// --- Save current query ---
document.getElementById("save").addEventListener("click", async () => {
    const query = document.getElementById("query").value.trim();
    const tagsOnly = !!document.getElementById("tagsOnly")?.checked;
    const useRegexp = !!document.getElementById("useRegexp")?.checked;
    if (!query) return;

    const { saved = [] } = await chrome.storage.local.get("saved");
    const exists = saved.some(s => s.query === query && !!s.tagsOnly === tagsOnly && !!s.useRegexp === useRegexp);
    if (exists) return;

    saved.unshift({ query, tagsOnly, useRegexp });
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

// ======================================================
// Autocomplete + Tag Panel Integration
// ======================================================

const queryInput = document.getElementById('query');
const suggestionsBox = document.getElementById('suggestions');
const tagPanel = document.getElementById('tag-panel');

let tags = [];
let activeIndex = -1;

// Collect tags with counts from bookmarks
function collectTagsWithCounts(callback) {
    chrome.bookmarks.getTree(nodes => {
        const tagMap = new Map();

        function walk(node) {
            if (node.url) {
                const desc = node.description || "";
                const matches = desc.match(/tag:([^\s]+)/gi);
                if (matches) {
                    matches.forEach(m => {
                        const tag = m.toLowerCase();
                        tagMap.set(tag, (tagMap.get(tag) || 0) + 1);
                    });
                }
            }
            if (node.children) node.children.forEach(walk);
        }

        nodes.forEach(walk);
        callback(Array.from(tagMap.entries()).sort());
    });
}

// Render tag panel
function renderTagPanel(tagsWithCounts) {
    // strip "tag:" prefix so panel shows bare tags
    tags = tagsWithCounts.map(([tag]) => tag.replace(/^tag:/, ""));
    tagPanel.innerHTML = tagsWithCounts
    .map(([tag, count]) => {
        const bare = tag.replace(/^tag:/, "");
        return `<div data-tag="${bare}">
        <span>${bare}</span><span>${count}</span>
        </div>`;
    })
    .join('');
}

// Autocomplete suggestions
function showSuggestions(prefix) {
    const matches = tags.filter(t => t.startsWith('tag:' + prefix.toLowerCase()));
    if (matches.length === 0) {
        hideSuggestions();
        return;
    }
    suggestionsBox.innerHTML = matches
    .map((m, i) => `<div data-index="${i}">${m}</div>`)
    .join('');
    suggestionsBox.style.display = 'block';
    activeIndex = -1;
}

function hideSuggestions() {
    suggestionsBox.style.display = 'none';
    activeIndex = -1;
}

function applySuggestion(tag) {
    const current = queryInput.value.trim();
    if (current) {
        // If user was mid‑typing a tag fragment, replace it
        if (/tag:[^\s]*$/i.test(current)) {
            queryInput.value = current.replace(/tag:[^\s]*$/i, tag);
        } else {
            // Otherwise append with AND
            queryInput.value = current + " AND " + tag;
        }
    } else {
        queryInput.value = tag;
    }
    hideSuggestions();
    queryInput.focus();
}

// Input events
queryInput.addEventListener('input', e => {
    const value = e.target.value;
    const match = value.match(/tag:([^\s]*)$/i);
    if (match) {
        showSuggestions(match[1]);
    } else {
        hideSuggestions();
    }
});

queryInput.addEventListener('keydown', e => {
    const items = suggestionsBox.querySelectorAll('div');
    if (suggestionsBox.style.display === 'block' && items.length > 0) {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            activeIndex = (activeIndex + 1) % items.length;
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            activeIndex = (activeIndex - 1 + items.length) % items.length;
        } else if (e.key === 'Enter') {
            if (activeIndex >= 0) {
                e.preventDefault();
                applySuggestion(items[activeIndex].textContent);
            }
        }
        items.forEach((el, i) => {
            el.classList.toggle('active', i === activeIndex);
        });
    }
});

suggestionsBox.addEventListener('click', e => {
    if (e.target.tagName === 'DIV') {
        applySuggestion(e.target.textContent);
    }
});

// Tag panel click
tagPanel.addEventListener('click', e => {
    const div = e.target.closest('div[data-tag]');
    if (div) {
        const tag = div.dataset.tag;
        const current = queryInput.value.trim();
        queryInput.value = current
        ? current + " AND " + tag
        : tag;
        searchBookmarks();
    }
});

// Initialize tag panel
collectTagsWithCounts(renderTagPanel);

// Refresh tags when bookmarks change
chrome.bookmarks.onChanged.addListener(() => collectTagsWithCounts(renderTagPanel));
chrome.bookmarks.onCreated.addListener(() => collectTagsWithCounts(renderTagPanel));
chrome.bookmarks.onRemoved.addListener(() => collectTagsWithCounts(renderTagPanel));
