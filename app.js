// SHA-256 hashing
async function sha256(str) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// AES encryption
async function encrypt(text, password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const keyMaterial = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
    const key = await crypto.subtle.deriveKey(
        { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt"]
    );
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(text));
    return {
        salt: Array.from(salt),
        iv: Array.from(iv),
        data: Array.from(new Uint8Array(encrypted))
    };
}

// AES decryption
async function decrypt(enc, password) {
    const salt = new Uint8Array(enc.salt);
    const iv = new Uint8Array(enc.iv);
    const data = new Uint8Array(enc.data);

    const keyMaterial = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
    const key = await crypto.subtle.deriveKey(
        { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        false,
        ["decrypt"]
    );

    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
    return new TextDecoder().decode(decrypted);
}

// GitHub API read/write
async function githubWrite(path, content, token) {
    const url = `https://api.github.com/repos/judeweidner/pallet-tracker/contents/${path}`;

    // get current file SHA
    const existing = await fetch(url).then(r => r.json());
    const sha = existing.sha;

    const body = {
        message: "update",
        content: btoa(unescape(encodeURIComponent(JSON.stringify(content, null, 2)))),
        sha
    };

    await fetch(url, {
        method: "PUT",
        headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
    });
}

async function githubRead(path, token) {
    const url = `https://api.github.com/repos/judeweidner/pallet-tracker/contents/${path}`;
    const res = await fetch(url, {
        headers: { "Authorization": `Bearer ${token}` }
    }).then(r => r.json());

    return JSON.parse(decodeURIComponent(escape(atob(res.content))));
}

// Login
document.getElementById("login-btn").onclick = async () => {
    const pw = document.getElementById("password-input").value;
    const hash = await sha256(pw);

    const correctHash = await sha256("LH_ship1");

    if (hash !== correctHash) {
        document.getElementById("login-error").innerText = "Incorrect password";
        return;
    }

    // decrypt token
    const enc = window.PALLET_TRACKER_CONFIG.encryptedToken;
    const token = await decrypt(enc, pw);

    window.GITHUB_TOKEN = token;

    document.getElementById("login-screen").style.display = "none";
    document.getElementById("app-screen").style.display = "block";
};

// Import file
document.getElementById("import-btn").onclick = async () => {
    const file = document.getElementById("file-input").files[0];
    const data = await file.arrayBuffer();

    const parsed = window.PalletLogic.parseWorkbook(data);

    const existing = await githubRead("data/pallets.json", window.GITHUB_TOKEN);

    const merged = window.PalletLogic.mergeImport(existing, parsed);

    await githubWrite("data/pallets.json", merged.pallets, window.GITHUB_TOKEN);
    await githubWrite("data/changes.json", merged.changes, window.GITHUB_TOKEN);

    alert("Import complete");
};
