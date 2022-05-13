let fileInput = document.getElementById("file");
let fileInfo = document.getElementsByClassName("file-info")[0];
let form = document.getElementsByTagName("form")[0];
let remoteConsole = document.getElementsByClassName("console")[0];
let bar = document.getElementsByClassName("upload-fill")[0];

if (fileInput) {
    fileInput.addEventListener("change", () => {
        /**
         * @type {File}
         */
        let file = fileInput.files[0];
        fileInfo.textContent = file.name + " (" + (file.size / 1000000).toFixed(2) + "MB)";
    });
    form.addEventListener("submit", (e) => {
        e.preventDefault();
        let file = fileInput.files[0];
        if (file) {
            let formdata = new FormData();
            formdata.append("file", file);
            const xhttp = new XMLHttpRequest();
            xhttp.open("POST", "/", true);
            xhttp.addEventListener("loadend", () => {
                location.reload();
            });
            xhttp.upload.addEventListener(
                "progress",
                function (e) {
                    if (e.lengthComputable) {
                        const percent = ((e.loaded / e.total) * 100).toFixed(2);
                        bar.style.width = percent + "%";
                        bar.textContent = percent + "%";
                        const xhUp = new XMLHttpRequest();
                        xhUp.open("GET", "upload/"+ (e.loaded/1048576).toFixed(1) + " of " + (e.total/1048576).toFixed(1), true);
                        xhUp.send();
                        console.log("yy");
                    }
                },
                false
            );
            xhttp.send(formdata);
        }
    });
} else if (remoteConsole) {
    let ct = setInterval(() => {
        const xhttp = new XMLHttpRequest();
        xhttp.onload = function () {
            if (this.readyState === 4 && this.status === 200) {
                let obj = JSON.parse(this.responseText);
                remoteConsole.innerHTML = obj.jobStatus;
                document.title = "b4m [" + obj.percentDone + "%] - " + obj.renderName;
                if (obj.status == 2) {
                    location.reload();
                }
            }
        };
        xhttp.open("GET", "progress", true);
        xhttp.send();
    }, 1000);
}
