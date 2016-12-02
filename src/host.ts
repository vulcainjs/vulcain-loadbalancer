const util = require('util');
import * as childProcess from 'child_process';
import * as shell from 'shelljs';

export interface IEngine {
    /**
     * Folder for storing letsencrypt's certificates
     *  (/etc/letsencrypt/live)
     */
    certificatesFolder: string;
    /**
     * Haproxy configuration files
     */
    configurationsFolder: string;
    /**
     * Test server listen on port 80 and do not generate certificates
     * On test seever, you can simulates a tenant by providing a $tenant url parameter
     *
     * @memberOf IEngine
     */
    isTestServer(): boolean;
    /**
     * Revoke a certificate (sync)
     *
     * @param {string} letsEncryptFolder
     * @param {string} domain
     *
     * @memberOf IEngine
     */
    revokeCertificate(letsEncryptFolder: string, domain: string);
    /**
     * Execute a command
     *
     * @param {string} command
     * @param {string} message
     * @returns {Promise<any>}
     *
     * @memberOf IEngine
     */
    processCommandAsync(command: string, message: string): Promise<any>;
    /**
     * Execute a command
     *
     * @param {string} domain
     * @param {string} email
     * @returns {Promise<any>}
     *
     * @memberOf IEngine
     */
    createCertificateAsync(domain: string, email: string): Promise<any>;
}

class MockEngine implements IEngine {
    public certificatesFolder: string;
    public configurationsFolder: string;

    constructor() {
        this.certificatesFolder = "./data/certificates";
        this.configurationsFolder = "./data/config";
    }

    isTestServer() {
        return process.env.VULCAIN_TEST === "true";
    }

    revokeCertificate(letsEncryptFolder: string, domain: string) {
        util.log("Revoke certificate " + domain);
    }

    // -------------------------------------------------------------------
    // Function called when a process is started
    // -------------------------------------------------------------------
    processCommandAsync(command: string, message: string): Promise<any> {
        util.log(`Running command ${command} - ${message}`);
        return Promise.resolve(true);
    }

    createCertificateAsync(domain: string, email: string): Promise<any> {
        util.log(`Create certificate for domain ${domain}`);
        return Promise.resolve(true);
    }
}

class HostEngine implements IEngine {

    public certificatesFolder = "/etc/letsencrypt/live";
    public configurationsFolder = "/var/haproxy";

    isTestServer() {
        return process.env.VULCAIN_TEST === "true";
    }

    revokeCertificate(letsEncryptFolder: string, domain: string) {
        const command = `certbot revoke -t -n --cert-path ${letsEncryptFolder}/${domain}/haproxy.pem`;
        util.log("Running command " + command);

        return new Promise((resolve, reject) => {

            shell.exec(command, (error, stdout, stderr) => {
                if (!error) {
                    console.log(stderr);
                    try {
                        util.log("Remove domain folder");
                        shell.rm("-rf", letsEncryptFolder + "/" + domain);
                        util.log("Remove domain renewal configuration");
                        shell.rm(letsEncryptFolder + "/renewal/" + domain + ".conf");
                    }
                    catch (e) {
                        util.log(`Certificat revocation failed for domain ${domain}`);
                    }
                }
                else {
                    util.log(`Certificat revocation failed for domain ${domain}`);
                    console.log(stderr);
                }
                resolve();
            });
        });
    }

    processCommandAsync(command: string, message: string): Promise<any> {
        util.log("Running command " + command);

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

    createCertificateAsync(domain: string, email: string): Promise<any> {
        util.log("Creating certificate for domain " + domain);
        return new Promise((resolve, reject) => {
            // TODO change default email
            childProcess.execFile("/app/cert-creation.sh", [domain, email || process.env["EXPIRATION_EMAIL"]], { cwd: "/app" }, (err, stdout, stderr) => {
                if (err) {
                    util.log(`Error when creating certficate for ${domain} - ${err}`);
                    reject(err);
                }
                else {
                    util.log(`Certificate created for ${domain} - ${stdout}`);
                    resolve();
                }
            });
        });
    }
}

export class EngineFactory {
    private static _engine: IEngine;

    static createEngine(): IEngine {
        if (!EngineFactory._engine) {
            EngineFactory._engine = process.env.TEST ? new MockEngine() : new HostEngine();
        }
        return EngineFactory._engine;
    }
}