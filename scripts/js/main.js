// RobloxAsset — fixed, modernized & updated for create.roblox.com
//
// Changes in this revision:
//   - Replaced all HTML scraping with Roblox's public JSON APIs
//     (economy.roblox.com for name/type, thumbnails.roblox.com for image)
//     → works with both www.roblox.com/catalog/ID and
//                        create.roblox.com/store/asset/ID URLs
//   - Asset ID is now extracted with a regex instead of a fragile split()[4],
//     so it works regardless of URL structure
//   - Asset type dropdown is now optional — type is auto-detected from API
//   - CORS proxy is only used for binary asset downloads, not JSON API calls
//
// Previous changes (still in effect):
//   - Removed exfiltration to nanooserver.000webhostapp.com
//   - Removed 5-second polling loop
//   - Replaced jQuery with vanilla JS
//   - Replaced callbacks/XHR with async/await
//   - Fixed clothing-as-sentinel bug, .rbxm extension, null-checks, etc.

const CORS_PROXY = "https://cors-anywhere.herokuapp.com/";

// Roblox AssetTypeId → file extension
// https://create.roblox.com/docs/reference/engine/enums/AssetType
const ASSET_TYPE_EXT = {
    1:  ".png",   // Image
    2:  ".rbxm",  // Mesh
    3:  ".lua",   // Lua script
    5:  ".rbxm",  // Hat
    8:  ".rbxm",  // Model
    9:  ".png",   // Decal
    11: ".png",   // Shirt
    12: ".png",   // Pants
    13: ".png",   // ShirtGraphic
    17: ".rbxm",  // Head
    18: ".png",   // Face
    19: ".rbxm",  // Gear
    21: ".png",   // Badge
    24: ".rbxm",  // Animation
    25: ".rbxm",  // Torso
    26: ".rbxm",  // RightArm
    27: ".rbxm",  // LeftArm
    28: ".rbxm",  // LeftLeg
    29: ".rbxm",  // RightLeg
    30: ".rbxm",  // Package
    38: ".rbxm",  // Plugin
    40: ".rbxm",  // MeshPart
    41: ".rbxm",  // HairAccessory
    42: ".rbxm",  // FaceAccessory
    43: ".rbxm",  // NeckAccessory
    44: ".rbxm",  // ShoulderAccessory
    45: ".rbxm",  // FrontAccessory
    46: ".rbxm",  // BackAccessory
    47: ".rbxm",  // WaistAccessory
    50: ".mp3",   // Audio
    51: ".rbxm",  // SolidModel
    61: ".ttf",   // Font
    62: ".ttf",   // FontFamily
    63: ".mp4",   // Video
};

// Types where we download the thumbnail image rather than the raw asset
const IMAGE_TYPES = new Set([1, 9, 11, 12, 13, 18, 21]);

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("submitAsset").addEventListener("click", processOptions);
});

// ─── ID extraction ────────────────────────────────────────────────────────────

/** Pull the first long numeric segment from any Roblox asset URL. Works for:
 *    https://www.roblox.com/catalog/6532975426/Name
 *    https://create.roblox.com/store/asset/6532975426/Name
 *    https://www.roblox.com/library/6532975426/Name
 */
function extractAssetId(url) {
    const match = url.match(/\/(\d{6,})/);
    return match ? match[1] : null;
}

// ─── Roblox JSON API calls (no CORS proxy needed) ─────────────────────────────

async function fetchJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
    return res.json();
}

async function getAssetDetails(assetId) {
    const data = await fetchJSON(
        `https://economy.roblox.com/v2/assets/${assetId}/details`
    );
    return { name: data.Name, assetTypeId: data.AssetTypeId };
}

async function getAssetThumbnailUrl(assetId) {
    const data = await fetchJSON(
        `https://thumbnails.roblox.com/v1/assets?assetIds=${assetId}&size=420x420&format=Png&isCircular=false`
    );
    const entry = data?.data?.[0];
    if (!entry || entry.state !== "Completed") {
        throw new Error("Thumbnail not yet available — try again in a moment");
    }
    return entry.imageUrl;
}

// ─── Binary download (CORS proxy required) ───────────────────────────────────

async function fetchBlob(url) {
    const res = await fetch(CORS_PROXY + url);
    if (!res.ok) throw new Error(`HTTP ${res.status} downloading asset`);
    return res.blob();
}

// ─── Main entry point ─────────────────────────────────────────────────────────

async function processOptions() {
    const assetURL = document.getElementById("assetURL").value.trim();

    hideError();
    resetBorders();

    if (!assetURL) {
        markInvalid("assetURL");
        return showError("Asset URL was not specified");
    }
    if (!assetURL.includes("roblox")) {
        markInvalid("assetURL");
        return showError("Invalid URL — must be a Roblox URL");
    }

    const assetId = extractAssetId(assetURL);
    if (!assetId) {
        markInvalid("assetURL");
        return showError("Could not find an asset ID in that URL");
    }

    showLoadMsg("Retrieving Asset... (1/3)");

    try {
        // Step 1: look up name + type via JSON API (no proxy needed)
        const { name, assetTypeId } = await getAssetDetails(assetId);
        const ext      = ASSET_TYPE_EXT[assetTypeId] ?? ".bin";
        const filename = sanitizeFilename(name) + ext;

        changeLoadMsg("Downloading Asset... (2/3)");

        // Step 2: choose source URL based on asset type
        let downloadUrl;
        if (IMAGE_TYPES.has(assetTypeId)) {
            // For image-type assets, use the CDN thumbnail (higher quality, no auth)
            downloadUrl = await getAssetThumbnailUrl(assetId);
        } else {
            // For everything else (models, audio, plugins, animations…)
            downloadUrl = `https://assetdelivery.roblox.com/v1/asset/?id=${assetId}`;
        }

        // Step 3: fetch the blob and trigger browser download
        await triggerDownload(downloadUrl, filename);

    } catch (err) {
        console.error(err);
        hideLoadMsg();
        showError("Error: " + err.message);
    }
}

// ─── Download trigger ─────────────────────────────────────────────────────────

async function triggerDownload(src, filename) {
    const blob   = await fetchBlob(src);
    const anchor = document.createElement("a");
    anchor.href  = URL.createObjectURL(blob);
    anchor.setAttribute("download", filename);
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(anchor.href);

    changeLoadMsg("Preparing Download... (3/3)");
    setTimeout(hideLoadMsg, 3000);
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function sanitizeFilename(name) {
    return (name ?? "unnamed").replace(/[/\\:*?"<>|]/g, "_").trim() || "unnamed";
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
    document.getElementById("assetURL").style.borderColor = "#ccc";
    const typeEl = document.getElementById("assetType");
    if (typeEl) typeEl.style.borderColor = "#ccc";
}
