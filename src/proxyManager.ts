import { TenantDefinition } from './model';
//   Licensed under the Apache License, Version 2.0 (the "License");
//   you may not use this file except in compliance with the License.
//   You may obtain a copy of the License at
//
//       http://www.apache.org/licenses/LICENSE-2.0
//
//   Unless required by applicable law or agreed to in writing, software
//   distributed under the License is distributed on an "AS IS" BASIS,
//   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//   See the License for the specific language governing permissions and
//   limitations under the License.
//
//    Copyright (c) Zenasoft
//
const childProcess = require('child_process');
const util = require('util');
const path = require('path');
const fs = require('fs');
const folder = '/var/haproxy';

export class ProxyManager {
    private restarting = false;
    private testMode: boolean;

    constructor() {
        this.testMode = process.env.VULCAIN_MODE === "test";
    }

    // -------------------------------------------------------------------
    // Define web api used to restart haproxy
    // -------------------------------------------------------------------
    restart() {
        // Simulate rx.debounce
        let self = this;
        if (!this.restarting) {
            this.restarting = true;
            setTimeout(function () {
                self.startProxy(false);
                self.restarting = false;
            }, 2000);
        }
    }

    // -------------------------------------------------------------------
    // combines all config file (one by cluster + default)
    // -------------------------------------------------------------------
    private createConfigFileArguments() {
        const defaultName = this.testMode ? "test" : "global";
        var args = ["-f " + folder + "/" + defaultName + ".default"];
        try {
            var files = fs.readdirSync(folder);
            files.forEach(function (file:string, index) {
                if (file.endsWith(".default"))
                    return;
                var fullPath = path.join(folder, file);
                args.push("-f " + fullPath);
            });
        }
        catch (e) {
            return;
        }
        return args.join(" ");
    }

    // -------------------------------------------------------------------
    // Start or restart proxy
    // -------------------------------------------------------------------
    public startProxy(firstTime:boolean) {

        const configFile = this.createConfigFileArguments();

        // First time just start haproxy
        //  -p /var/haproxy/haproxy.pid : Tell haproxy to store process id and child process id in haproxy.pid
        //  -f /var/haproxy/haproxy.cfg ... : use a specific config file (works with share volume with service discover)
        if (firstTime) {
            util.log("Starting haproxy with " + configFile);
            return this.processCommand("haproxy " + configFile + " -p /var/run/haproxy.pid", "Start haproxy");
        }
        else {
            // Soft restart
            // -sf : tells haproxy to send sigterm to all pid of the old haproxy process when the new process is ready
            util.log("Restarting haproxy with " + configFile);
            return this.processCommand("haproxy " + configFile + " -p /var/run/haproxy.pid -sf $(cat /var/run/haproxy.pid)", "Restart haproxy");
        }
    }

    // -------------------------------------------------------------------
    // Function called when a process is started
    // -------------------------------------------------------------------
    private processCommand(command: string, message:string) : Promise<any> {
        return new Promise((resolve, reject) => {
            childProcess.exec(command, (error, stdout, stderr) => {
                if (!error) {
                    util.log("Success: " + message);
                    resolve(true);
                }
                else {
                    util.log("***** Error ***** " + message);
                    stdout && util.log(" stdout : " + stdout);
                    stderr && util.log(" stderr : " + stderr);
                    reject(error);
                }
            });
        });
    }

    purge(domains: Array<TenantDefinition>) {
        const certificatesFolder = "/etc/letsencrypt/live";
        fs.exists(certificatesFolder, exists => {
            if (!exists)
                return;

            fs.readdir(certificatesFolder, (err, folders) => {
                if (err) {
                    util.log("Error when trying to purge certificates " + err);
                    return;
                }

                let domainNames = domains.map(d => d.domain.toLowerCase());

                for (const folder of folders) {
                    if (domainNames.find(d => d === folder.toLowerCase()))
                        continue;

                    this.processCommand("certbot revoke --cert-path " + certificatesFolder + "/" + folder + "/haproxy.pem", "Revoke domain");
                }
            });
        });
    }

    createCertificate(domain: string, email: string) {
        return new Promise((resolve, reject) => {
            fs.exists("/etc/letsencrypt/live/" + domain, exists => {
                if (!exists) {
                    util.log("Creating certificate for " + domain);
                    childProcess.execFile("/app/cert-creation.sh", [domain, email || "ametge@sovinty.com"], { cwd: "/app" }, (err, stdout, stderr) => {
                        if (err) {
                            util.log(`Error when creating certficate for ${domain} - ${err}`);
                            reject(err);
                        }
                        else {
                            util.log(`Certificate created for ${domain} - ${stdout}`);
                            resolve();
                        }
                    });
                }
                else
                    resolve();
            });
        });
    }
}