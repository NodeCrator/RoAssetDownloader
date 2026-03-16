// RobloxAsset — fixed & modernized
// Changes from original:
//   - Removed exfiltration to nanooserver.000webhostapp.com
//   - Removed 5-second polling loop
//   - Fixed broken asset-type sentinel ("clothing" was used as both the
//     default empty value AND a real type, making clothing undownloadable)
//   - Fixed unnamed model fallback extension (.rbxm, not .png)
//   - Fixed dead "model" entry in simpleTypes (models go through parseXML)
//   - Added null-checks before accessing query results
//   - Moved showLoadMsg() before the async fetch so it appears immediately
//   - Replaced jQuery with vanilla JS
//   - Replaced callbacks/XHR with async/await

const CORS_PROXY = "https://cors-anywhere.herokuapp.com/";

// Asset type → file extension map
const EXTENSIONS = {
    sound:     ".mp3",
    clothing:  ".png",
    mesh:      ".rbxm",
    plugin:    ".rbxm",
    accessory: ".png",
    model:     ".rbxm",
};

// These types are fetched directly from the asset delivery API
const DIRECT_FETCH_TYPES = ["mesh", "plugin", "accessory"];

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("submitAsset").addEventListener("click", processOptions);
});

// ─── Main entry point ────────────────────────────────────────────────────────

async function processOptions() {
    const assetURL  = document.getElementById("assetURL").value.trim();
    const assetType = document.getElementById("assetType").value;

    hideError();
    resetBorders();

    // Validate
    if (!assetURL && !assetType) {
        markInvalid("assetURL");
        markInvalid("assetType");
        return showError("Options were not specified");
    }
    if (!assetURL) {
        markInvalid("assetURL");
        return showError("Asset URL was not specified");
    }
    if (!assetType) {
        markInvalid("assetType");
        return showError("Asset Type was not specified");
    }
    if (!assetURL.includes("roblox")) {
        markInvalid("assetURL");
        return showError("Invalid URL — must be a Roblox URL");
    }

    showLoadMsg("Retrieving Asset... (1/3)");

    try {
        if (assetType === "model") {
            // Model assets: fetch XML from assetgame, extract inner URL, download as .rbxm
            const assetId  = assetURL.split("/")[4];
            const xmlText  = await fetchText(`https://assetgame.roblox.com/Asset/?id=${assetId}`);
            await downloadFromXML(xmlText, assetURL);
        } else if (assetType === "clothing" || assetType === "sound") {
            // Clothing & sound: scrape the asset page for thumbnail/name
            const htmlText = await fetchText(assetURL);
            await downloadFromHTML(htmlText, assetType, assetURL);
        } else if (DIRECT_FETCH_TYPES.includes(assetType)) {
            // Mesh, plugin, accessory: hit asset delivery directly
            const assetId  = assetURL.split("/")[4];
            const htmlText = await fetchText(assetURL);
            await downloadDirect(htmlText, assetType, assetId);
        } else {
            showError(`Unknown asset type: "${assetType}"`);
            hideLoadMsg();
        }
    } catch (err) {
        console.error(err);
        hideLoadMsg();
        showError("Error: " + err.message);
    }
}

// ─── Fetch helpers ────────────────────────────────────────────────────────────

async function fetchText(url) {
    const response = await fetch(CORS_PROXY + url);
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
    return response.text();
}

async function fetchBlob(url) {
    const response = await fetch(CORS_PROXY + url);
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
    return response.blob();
}

// ─── Parsers ──────────────────────────────────────────────────────────────────

async function downloadFromXML(xmlText, originalURL) {
    const parser   = new DOMParser();
    const xmlDoc   = parser.parseFromString(xmlText, "text/xml");
    const urlNodes = xmlDoc.getElementsByTagName("url");

    if (!urlNodes.length) throw new Error("Could not find asset URL in XML response");

    const assetSrc  = urlNodes[0].innerHTML;
    const namePart  = originalURL.split("/")[5];
    const filename  = namePart ? `${namePart}.rbxm` : "unnamed.rbxm";

    changeLoadMsg("Downloading Asset... (2/3)");
    await triggerDownload(assetSrc, filename);
}

async function downloadFromHTML(htmlText, assetType, originalURL) {
    const parser = new DOMParser();
    const doc    = parser.parseFromString(htmlText, "text/html");

    const imgEl  = doc.querySelector(".thumbnail-span img");
    const nameEl = doc.querySelector(".item-name-container h2");

    if (!imgEl)  throw new Error("Could not find asset thumbnail on page");
    if (!nameEl) throw new Error("Could not find asset name on page");

    const ext      = EXTENSIONS[assetType] ?? ".bin";
    const assetSrc = imgEl.getAttribute("src");
    const filename = nameEl.innerText.trim() + ext;

    changeLoadMsg("Downloading Asset... (2/3)");
    await triggerDownload(assetSrc, filename);
}

async function downloadDirect(htmlText, assetType, assetId) {
    const parser = new DOMParser();
    const doc    = parser.parseFromString(htmlText, "text/html");

    const nameEl = doc.querySelector(".item-name-container h2");
    if (!nameEl) throw new Error("Could not find asset name on page");

    const ext      = EXTENSIONS[assetType] ?? ".bin";
    const assetSrc = `https://assetdelivery.roblox.com/v1/asset/?id=${assetId}`;
    const filename = nameEl.innerText.trim() + ext;

    changeLoadMsg("Downloading Asset... (2/3)");
    await triggerDownload(assetSrc, filename);
}

// ─── Download trigger ─────────────────────────────────────────────────────────

async function triggerDownload(src, filename) {
    const blob   = await fetchBlob(src);
    const anchor = document.createElement("a");
    anchor.href  = URL.createObjectURL(blob);
    anchor.setAttribute("download", filename);
    anchor.click();
    URL.revokeObjectURL(anchor.href); // clean up

    changeLoadMsg("Preparing Download... (3/3)");
    setTimeout(hideLoadMsg, 3000);
}

// ─── UI helpers ───────────────────────────────────────────────────────────────

function showError(message) {
    const el = document.getElementById("errorMsg");
    el.innerText = message;
    el.style.display = "";
}

function hideError() {
    document.getElementById("errorMsg").style.display = "none";
}

function showLoadMsg(message) {
    const el = document.getElementById("loadMsg");
    el.innerText = message;
    el.style.display = "";
    document.getElementById("submitAsset").style.display = "none";
}

function hideLoadMsg() {
    document.getElementById("loadMsg").style.display = "none";
    document.getElementById("submitAsset").style.display = "";
}

function changeLoadMsg(message) {
    document.getElementById("loadMsg").innerText = message;
}

function markInvalid(id) {
    document.getElementById(id).style.borderColor = "#f74b52";
}

function resetBorders() {
    document.getElementById("assetURL").style.borderColor  = "#ccc";
    document.getElementById("assetType").style.borderColor = "#ccc";
}
