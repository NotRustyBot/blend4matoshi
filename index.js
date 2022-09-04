const express = require("express");
const axios = require("axios").default;
const upload = require("express-fileupload");
const fs = require("fs");
const archiver = require("archiver");
const { spawn, exec, execSync, spawnSync } = require("child_process");

let str;

let settings = JSON.parse(fs.readFileSync("settings.json"));
let auth = JSON.parse(fs.readFileSync("auth.json"));

let userId = settings.userId;
let msPerMatoshi = settings.msPerMatoshi;
let blenderLocation = settings.blenderLocation;
let pythonLocation = settings.pythonLocation;

let onRenderStart = settings.onRenderStart || "";
let onRenderFinish = settings.onRenderFinish || "";

let jobStatus = "Readying...";
let cost = 0;
let status = 0;
let frames = 0;
let originalName;
let time;
let percentDone = 0;

let blenderInfo = spawnSync(blenderLocation, ["-v"]).output
    .toString()
    .split("\n")[0].replace(",","");

const app = express();

process.on('SIGINT', ()=>{
    if (status != 1) process.exit();
    console.log("ignoring SIGINT while rendering");
});

app.use(express.static("public"));
app.set("view engine", "ejs");

app.get("/", (req, res) => {
    let files = fs.readdirSync("workdir/");
    let links = [];
    for (let i = 0; i < files.length; i++) {
        links[i] = "/file/" + files[i];
    }
    res.render("index", { status: status, links: links, cost: cost, blenderInfo: blenderInfo, rate:(1000/msPerMatoshi).toFixed(2) });
});

app.get("/progress", (req, res) => {
    res.json({ jobStatus: jobStatus, status: status, percentDone: percentDone, renderName: originalName });
});

app.get("/reset", (req, res) => {
    jobStatus = "Readying...";
    cost = 0;
    status = 0;
    frames = 0;
    percentDone = 0;
    res.redirect("/");
});

app.get("/cancel", (req, res) => {
    console.log("cancelling a job worth " + cost + " matoshi");
    str.removeAllListeners();
    str.kill();
    jobStatus = "Readying...";
    cost = 0;
    status = 0;
    frames = 0;
    percentDone = 0;
    res.redirect("/");
});

app.get("/file/:file", (req, res) => {
    res.sendFile(__dirname + "/workdir/" + req.params.file, { status: status });
});

app.get("/upload/:data", (req, res) => {
    console.log("uploaded " + req.params.data + " MB");
    res.sendStatus(204);
});

app.use(upload());
app.post("/", (req, res) => {
    if (req.files) {
        let file = req.files.file;
        originalName = file.name;
        fs.rmSync("workdir", { recursive: true, force: true });
        fs.mkdirSync("workdir");
        if (onRenderStart != "") {
            exec(onRenderStart);
            console.log("onRenderStart:");
            console.log(onRenderStart);
        }
        file.mv("workdir/file.blend", (err) => {
            let getInfo = spawn(pythonLocation, ["get_frames.py"]);
            let startframe = 0;
            let endframe = 0;
            getInfo.stdout.on("data", (data) => {
                let line = data.toString();
                console.log(line);
                startframe = line.split("|")[0].trim();
                endframe = line.split("|")[1].trim();
            });
            getInfo.on("exit", () => {
                console.log("starting on frame " + startframe);
                res.redirect("/");
                str = spawn(blenderLocation, ["-b", "workdir/file.blend", "-x", "1", "-o", "//render", "-a"], {detached: true});
                status = 1;
                let ct = setInterval(() => {
                    cost++;
                }, msPerMatoshi);
                time = Date.now();
                let times = 0;
                str.stdout.on("data", (data) => {
                    data = data.toString();
                    if (data.includes("Finished")) {
                        frames++;
                        let runtime = new Date(Date.now() - time);
                        let est = (runtime * (endframe - startframe + 1)) / frames;
                        let endtime = new Date(est - runtime);
                        percentDone = (frames / (endframe - startframe + 1)) * 100;
                        jobStatus =
                            "[" +
                            runtime.getUTCHours().toString().padStart(2, "0") +
                            ":" +
                            (runtime.getMinutes() % 60).toString().padStart(2, "0") +
                            ":" +
                            (runtime.getSeconds() % 60).toString().padStart(2, "0") +
                            "] " +
                            data.split("|")[0].split(" ")[0].replace("Fra:", "Frame:") +
                            "/" +
                            endframe +
                            data.split("|")[1] +
                            "| Remaining:" +
                            endtime.getUTCHours().toString().padStart(2, "0") +
                            ":" +
                            (endtime.getMinutes() % 60).toString().padStart(2, "0") +
                            ":" +
                            (endtime.getSeconds() % 60).toString().padStart(2, "0") +
                            " | Cost:" +
                            cost.toFixed(0) +
                            "₥";

                        console.log(jobStatus);
                    }
                });
                str.on("exit", () => {
                    console.log("rendering complete.");
                    clearInterval(ct);
                    jobStatus = "Done.";
                    console.log("finished");
                    status = 2;
                    let resTime = Date.now() - time;
                    resTime = resTime / 1000;
                    fs.unlinkSync("workdir/file.blend");

                    if (fs.readdirSync("workdir").length == 1) {
                        let name = fs.readdirSync("workdir")[0];

                        wanify(name, "workdir/" + name, resTime);
                    } else {
                        let archive = archiver("zip", { zlib: { level: 9 } });
                        archive.directory("workdir", false);
                        let name = currentFileName() + ".zip";
                        let output = fs.createWriteStream(name);
                        archive.pipe(output);
                        output.on("close", () => {
                            wanify(name, name, resTime);
                            fs.unlink(name);
                        });
                        archive.finalize();
                    }
                    if (onRenderFinish != "") {
                        exec(onRenderFinish);
                        console.log("onRenderFinish:");
                        console.log(onRenderFinish);
                    }
                });
            });
        });
    }
});

async function wanify(name, fullname, resTime) {
    let authObject = {
        username: auth.cloudNick,
        password: auth.cloudPass,
    };
    name = `${parseInt(userId) % 10000}-${Date.now().toString()}-${name}`;
    console.log(name);
    await axios.put("https://cloud.coal.games/remote.php/files/renders/" + name, fs.readFileSync(fullname), {
        auth: authObject,
        maxBodyLength: Infinity,
        maxContentLength: Infinity
    });
    let response = await axios.post("https://cloud.coal.games/ocs/v2.php/apps/files_sharing/api/v1/shares", `path=renders/${name}&shareType=3`, {
        auth: authObject,
        headers: {
            "OCS-APIRequest": "true",
        },
    });

    const result = {
        description: `b4m render finished!\n rendered \`${frames}\` frames of \`${originalName}\` in \`${resTime}\` seconds.\n ${response.data.ocs.data.url}`,
        from: "532918953014722560",
        to: userId,
        amount: cost + 1,
    };
    console.log("sending payment request");
    //axios.post("https://jacekkocek.coal.games/matoshi/payment", result).then((res) => console.log(res.data));
}

function currentFileName() {
    let now = new Date();
    return `${now.getFullYear()} ${now.getMonth() + 1} ${now.getDate()} ${now.getHours()}-${now.getMinutes()}`;
}

app.listen(80);
console.log("started");
