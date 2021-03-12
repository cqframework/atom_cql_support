
// const { mkDirByPathSync } = require('../../language-cql-common/lib/file-system-helpers');

const fs = require('fs');
const fileUrl = require('file-url');
const path = require('path');

const EventEmitter = require("events");

const { CompositeDisposable, Disposable } = require('atom');

const BUSY_SIGNAL_READY_EVENT = Symbol('language-cql-busy-signal-ready');

class CqlEvaluatorClient {
    constructor() {
        this.emitter = new EventEmitter();
        this.statusElement = document.createElement('span')
        this.statusElement.className = 'inline-block'
    }

    activate() {
        require('atom-package-deps')
            .install('language-cql-debug');
        this.subscriptions = new CompositeDisposable();

        this.ensureCQLService();
    }

    deactivate() {
        this.subscriptions.dispose();
    }

    async ensureCQLService() {
        // await installJavaDependencies(javaDependencies, (status) => this.updateInstallStatus(status))
        this.addCQLExecuteMenu();
    };


    addCQLExecuteMenu() {
        this.subscriptions.add(atom.commands.add(
            'atom-text-editor',
            'language-cql-debug:executeCQLFile',
            async (e) => {
                this.executeCQLFile(e.currentTarget, false)
            }
        ));

        this.subscriptions.add(atom.contextMenu.add({
            'atom-text-editor': [
                {
                    type: 'separator'
                },
                {
                    label: 'CQL',
                    submenu: [{
                        label: "Execute CQL",
                        command: 'language-cql-debug:executeCQLFile'
                    }],
                    shouldDisplay: (e) => { return atom.workspace.getActiveTextEditor().getGrammar().name == "CQL" }
                }]
        }));
    }


    async executeCQLFile(editor) {
        await this.busySignalReady();
        if (!this.languageClient) {
            // TODO: Set up commands so they initialize on language client consumption.
            return;
        }

        // const jarPath = getServicePath(javaDependencies["cql-evaluator"]);
        // const command = getJavaCommand();

        //convert.default.pathToUri doesn't give a useable format.  Not sure if that's a problem.
        //hope it's not because path handles it.
        const libraryPath = editor.getModel().getPath();
        if (!fs.existsSync(libraryPath)) {
            atom.notifications.addInfo("No library content found. Please save before executing.", { dismissable: true });
            return;
        }

        const libraryPathName = path.basename(libraryPath, '.cql');

        //todo: replace with library-uri when it's ready
        const libraryDirectory = path.dirname(libraryPath);
        const libraryName = libraryPathName.split('-')[0];

        var projectPath = '';
        atom.project.getDirectories().forEach(function (dir) {
            if (dir.contains(libraryPath)) {
                projectPath = dir.path;
            }
        });

        //todo: make this a setting
        // var terminologyPath = atom.config.get("language-cql.terminologyServer");
        // // Undefined or blank
        // if ( (!terminologyPath || /^\s*$/.test(terminologyPath))) {
        var terminologyPath = path.join(projectPath, 'input', 'vocabulary', 'valueset');
        //}

        //todo: get this working (currently errors with: Index 0 out of bounds for length 0)
        //const measurementPeriod = 'Interval[@2019-01-01T00:00:00.0, @2020-01-01T00:00:00.0)';
        const modelType = "FHIR";
        const contextType = 'Patient';
        var fhirVersion = "R4";
        const measurementPeriod = ''
        const testPath = path.join(projectPath, 'input', 'tests');
        const resultPath = path.join(testPath, 'results');

        const fhirVersionRegex = /using (FHIR|"FHIR") version '(\d(.|\d)*)'/;
        var matches = editor.getModel().getText().match(fhirVersionRegex);

        if (matches && matches.length > 2) {
            const version = matches[2];
            if (version.startsWith("2")) {
                fhirVersion = "DSTU2"
            }
            else if (version.startsWith("3")) {
                fhirVersion = "DSTU3"
            }
            else if (version.startsWith("4")) {
                fhirVersion = "R4"
            }
            else if (version.startsWith("5")) {
                fhirVersion = "R5"
            }
        }
        else {
            fhirVersion = "R4"
            atom.notifications.addInfo("Unable to determine version of FHIR used. Defaulting to R4.");
        }


        // Recursively creates directory
        // mkDirByPathSync(resultPath);

        const modelRootPath = this.getModelRootPath(testPath, libraryPathName);

        var textEditor = await atom.workspace.open(`${path.join(resultPath, libraryPathName + '.txt')}`, {
            cursorBlink: false,
            visualBell: true,
            convertEol: true,
            termName: 'xterm-256color',
            scrollback: 1000,
            rows: 8,
            split: 'right',
            searchAllPanes: true
        });

        await editor.focus();

        let terminologyPathActual = terminologyPath;
        if (!terminologyPath || terminologyPath == '' || !fs.existsSync(terminologyPath)) {
            terminologyPathActual = ''
        }

        await textEditor.moveToBottom();
        var modelMessage = (modelRootPath && modelRootPath != '') ? `Data path: ${modelRootPath}` : `No tests found at ${testPath}. Evaluation may fail if data is required.`
        var terminologyMessage = (terminologyPathActual && terminologyPathActual != '') ? `Terminology path: ${terminologyPathActual}` : `No terminology found at ${terminologyPath}. Evaluation may fail if terminology is required.`
        await textEditor.insertText('Running tests.\r\n');
        await textEditor.insertText(`${modelMessage}\r\n`);
        await textEditor.insertText(`${terminologyMessage}\r\n`);

        // let jarArgs = this.getJavaJarArgs(jarPath);
        let operationArgs = this.getCqlCommandArgs(fhirVersion);

        if (modelRootPath && modelRootPath != '' && fs.existsSync(modelRootPath)) {
            var dirs = fs.readdirSync(modelRootPath, { withFileTypes: true })
                .filter(dirent => dirent.isDirectory())

            if (dirs && dirs.length > 0) {
                dirs.forEach(async (dirent) => {
                    const context = dirent.name;
                    const modelPath = path.join(modelRootPath, dirent.name);
                    operationArgs = this.getExecArgs(operationArgs, libraryDirectory, libraryName, modelType, modelPath, terminologyPathActual, context, measurementPeriod);
                });
            }
            else {
                operationArgs = this.getExecArgs(operationArgs, libraryDirectory, libraryName, modelType, null, terminologyPathActual, null, measurementPeriod);
            }
        }
        else {
            operationArgs = this.getExecArgs(operationArgs, libraryDirectory, libraryName, modelType, null, terminologyPathActual, null, measurementPeriod);
        }

        await this.executeCQL(textEditor, operationArgs, editor);
    }

    getModelRootPath(parentPath, libraryPathName) {
        var modelRootPath = '';
        if (fs.existsSync(parentPath)) {
            fs.readdirSync(parentPath, { withFileTypes: true })
                .filter(dirent => dirent.isDirectory())
                .forEach(dirent => {
                    if (modelRootPath == '') {
                        if (dirent.name == libraryPathName) {
                            modelRootPath = path.join(parentPath, dirent.name);
                        } else {
                            modelRootPath = this.getModelRootPath(path.join(parentPath, dirent.name), libraryPathName)
                        }
                    }
                });
        }
        return modelRootPath;
    }

    async executeCQL(textEditor, operationArgs, editor) {

        if (!this.languageClient) {
            return;
        }

        // const tmpobj = tmp.fileSync();
        // fs.writeSync(tmpobj.fd, operationArgs.join("\n"))

        // const newArgs = ["argfile", tmpobj.name];


        // Array.prototype.push.apply(jarArgs, newArgs);


        const connection = await this.languageClient.getConnectionForEditor(editor.getModel());
        const startExecution = new Date();
        const result = await connection.executeCommand({ command: 'org.opencds.cqf.cql.ls.plugin.debug.startDebugSession', arguments: operationArgs });
        const endExecution = new Date();
        //const cql = cp.spawn(command, jarArgs, { stdio: ['ignore', 'pipe', 'pipe'] });

        await textEditor.insertText(result);
        // await this.echoToTextEditor(textEditor, cql.stdout);



        // await this.echoToTextEditor(textEditor, cql.stderr);

        await textEditor.moveToBottom();

        await textEditor.insertText(`elapsed: ${((endExecution - startExecution) / 1000).toString()} seconds\r\n\r\n`);

        // tmpobj.removeCallback();
    }

    async* chunksToLines(chunksAsync) {
        let previous = '';
        for await (const chunk of chunksAsync) {
            previous += chunk;
            let eolIndex;
            while ((eolIndex = previous.indexOf('\n')) >= 0) {
                // line includes the EOL
                const line = previous.slice(0, eolIndex + 1);
                yield line;
                previous = previous.slice(eolIndex + 1);
            }
        }
        if (previous.length > 0) {
            yield previous;
        }
    }

    async echoToTextEditor(textEditor, readable) {
        for await (const line of this.chunksToLines(readable)) {
            await textEditor.insertText(line);
        }
    }

    async echoToConsole(readable) {
        for await (const line of this.chunksToLines(readable)) {
            console.log(line);
        }
    }

    getJavaJarArgs(jarPath) {
        var args = [];
        // if (debug) {
        //     args.push('-Xdebug');
        //     args.push('-Xrunjdwp:transport=dt_socket,server=y,suspend=y,address=5051,quiet=y')
        // }

        // args.push("-Xshare:auto")
        // args.push("-Xverify:none")
        args.push("-XX:TieredStopAtLevel=1")

        args.push('-jar');
        args.push(jarPath);

        return args;
    }

    getCqlCommandArgs(fhirVersion) {
        let args = ["cql"];

        if (fhirVersion && fhirVersion != '') {
            args.push(`-fv=${fhirVersion}`);
        }
        else {
            args.push(`-fv=R4`);
        }
        return args;
    }

    getExecArgs(args, libraryDirectory, libraryName, modelType, modelPath, terminologyPath, contextValue, measurementPeriod) {
        args.push(`-ln=${libraryName}`)
        args.push(`-lu=${fileUrl(libraryDirectory)}`);

        if (modelType && modelType != '' && modelPath && modelPath != null) {
            args.push('-m=FHIR');
            args.push(`-mu=${fileUrl(modelPath)}`);
        }

        if (terminologyPath && terminologyPath != '') {
            args.push(`-t=${fileUrl(terminologyPath)}`);
        }

        if (contextValue && contextValue != '') {
            args.push(`-c=Patient`);
            args.push(`-cv=${contextValue}`);
        }

        if (measurementPeriod && measurementPeriod != '') {
            args.push(`-p=${libraryName}."Measurement Period"`);
            args.push(`-pv=${measurementPeriod}`);
        }

        return args;
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

    consumeLanguageClient(languageClient) {
        this.languageClient = languageClient;
        this.subscriptions.add(new Disposable(() => delete this.languageClient));
    }
}

module.exports = new CqlEvaluatorClient();