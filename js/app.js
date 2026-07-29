
const filesElement = document.getElementById("files");
const pathElement = document.getElementById("path");

const currentPath = new URLSearchParams(window.location.search).get("path") || "";

async function loadFiles(path = "") {
    const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`;

    try {
        const response = await fetch(apiUrl);
        const data = await response.json();

        pathElement.textContent = "/" + path;

        filesElement.innerHTML = "";

        if (!Array.isArray(data)) {
            filesElement.innerHTML = "<li>No files found.</li>";
            return;
        }

        if (path) {
            const parent = path.split("/").slice(0, -1).join("/");
            const li = document.createElement("li");
            const a = document.createElement("a");
            a.href = `?path=${encodeURIComponent(parent)}`;
            a.textContent = ".. (Back)";
            li.appendChild(a);
            filesElement.appendChild(li);
        }

        data.forEach(item => {
            const li = document.createElement("li");
            const a = document.createElement("a");

            if (item.type === "dir") {
                a.href = `?path=${encodeURIComponent(item.path)}`;
                a.textContent = item.name + "/";
            } else {
                a.href = item.download_url;
                a.textContent = item.name;
                a.target = "_blank";
            }

            li.appendChild(a);
            filesElement.appendChild(li);
        });
    } catch (error) {
        filesElement.innerHTML = `<li>Error: ${error.message}</li>`;
    }
}

loadFiles(currentPath);
