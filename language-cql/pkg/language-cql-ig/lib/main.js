
const { getServicePath, installJavaDependencies } = require('../../language-cql-common/lib/java-service-installer');

const { getJavaCommand } = require('../../language-cql-common/lib/java-helpers');

const cp = require("child_process");

const EventEmitter = require("events");

const { CompositeDisposable, Disposable } = require('atom');

const javaDependencies = require('../package.json').javaDependencies;

const BUSY_SIGNAL_READY_EVENT = Symbol('language-cql-busy-signal-ready');

class CqfToolingClient {

    constructor() {
        this.emitter = new EventEmitter();
    }
    activate() {
        require('atom-package-deps')
        .install('language-cql-ig');
        this.subscriptions = new CompositeDisposable();

        // this.ensureCqfTooling();
    }

    deactivate() {
        this.subscriptions.dispose();
    }

    addRefreshLibraryMenu() {
        this.subscriptions.add(atom.commands.add(
            '.tree-view .file .name[data-name$=".cql"]',
            'language-cql-ig:refreshLibrary',
            async (e) => {
                refreshCql(e.currentTarget);
            }
        ));

        this.subscriptions.add(atom.contextMenu.add({
            '.tree-view .file .name[data-name$=".cql"]': [
                {
                    label: 'IG Operations',
                    submenu: [{
                        label: "Refresh",
                        command: 'language-cql-ig:refreshLibrary'
                    }]
                },
                {
                    type: 'separator'
                }
            ]
        }));
    }

    addRefreshIGMenu() {
        this.subscriptions.add(atom.commands.add(
            '.tree-view .file .name[data-name$="ig.ini"]',
            'language-cql-ig:refreshIg',
            async (e) => {
                refreshIg(e.currentTarget)
            }
        ));

        this.subscriptions.add(atom.contextMenu.add({
            '.tree-view .file .name[data-name$="ig.ini"]': [
                {
                    label: 'IG Operations',
                    submenu: [{
                        label: "Refresh",
                        command: 'language-cql-ig:refreshIg'
                    }]
                },
                {
                    type: 'separator'
                }
            ]
        }));
    }

    async ensureCqfTooling() {
        await this.busySignalReady();
        await installJavaDependencies(javaDependencies, (status) => this.updateInstallStatus(status));
        addRefreshIGMenu(connection);
        addRefreshLibraryMenu(connection);
    }


    async refreshCql(target) {
        const jarPath = getServicePath("cqf-tooling");
        const command = getJavaCommand();

        const cqlPath = target.dataset.path;

        var args = [];
        args.push('-jar');
        args.push(jarPath);
        args.push('-RefreshLibrary');
        args.push(`"-cql=${cqlPath}"`);

        cp.exec(`"${command}" ${args.join(' ')}`, async (error, stdout, stderr) => {
            if (error) {
                //console.error(`exec error: ${error}`);
                handleJarError(error, jarPath);
                //this results display should be in the caller, but I keep getting a null from the promise that's returned
                console.error(error);
                return;
            }
            if (stderr && stderr.length > 0) {
                console.error(`stderr: ${stderr}`);
            }
        });
    }

    async refreshIg(target) {
        const jarPath = getServicePath("cqf-tooling");
        const command = getJavaCommand();

        const iniPath = target.dataset.path;

        var args = [];
        args.push('-jar');
        args.push(jarPath);
        args.push('-RefreshIG');
        args.push(`"-ini=${iniPath}"`);
        args.push('-elm')
        args.push('-t')
        args.push('-d')
        args.push('-p')
        args.push('-v')

        cp.exec(`"${command}" ${args.join(' ')}`, async (error, stdout, stderr) => {
            if (error) {
                //console.error(`exec error: ${error}`);
                handleJarError(error, jarPath);
                //this results display should be in the caller, but I keep getting a null from the promise that's returned
                console.error(error);
                return;
            }
            if (stderr && stderr.length > 0) {
                console.error(`stderr: ${stderr}`);
            }
        });
    }

    updateInstallStatus(status) {
        const isComplete = (status.includes('installed') || status.includes('failed'));
        if (this.busySignalService) {
            if (this._installSignal == null) {
                if (!isComplete) {
                    this._installSignal = this.busySignalService.reportBusy(status, { revealTooltip: true })
                }
            } else {
                if (isComplete) {
                    this._installSignal.dispose()
                } else {
                    this._installSignal.setTitle(status)
                }
            }
        } else {
            this.updateStatusBar(status)
        }
    }

    updateStatusBar(text) {
        this.statusElement.textContent = `${this.name} ${text}`
        if (!this.statusTile && this.statusBar) {
            this.statusTile = this.statusBar.addRightTile({ item: this.statusElement, priority: 1000 })
        }
    }

    async busySignalReady() {
        let self = this;
        return new Promise(function (resolve, reject) {
          if (self.busySignalService) {
            resolve()
            return
          }
          self.emitter.on(BUSY_SIGNAL_READY_EVENT, resolve)
        })
      }
    consumeBusySignal(busySignalService) {

        this.busySignalService = busySignalService;

        this.subscriptions.add(new Disposable(() => delete this.busySignalService));
        this.emitter.emit(BUSY_SIGNAL_READY_EVENT)
    }

    consumeStatusBar(statusBar) {
        this.statusBar = statusBar
    }
}

module.exports = new CqfToolingClient();