const { AutoLanguageClient } = require("atom-languageclient");
const cp = require("child_process");
const fs = require('fs');
const fileUrl = require('file-url');
const path = require('path');
const { shell } = require('electron');
const convert = require('atom-languageclient/build/lib/convert');
const minJavaRuntime = 1.8;

const { installServiceIfRequired, getJarPath, handleJarError }= require('./jar-helpers');

class CQLLanguageClient extends AutoLanguageClient {
  getGrammarScopes() { return ["source.cql"]; }
  getLanguageName() { return "cql"; }
  getServerName() { return "cql-language-server"; }

  constructor() {
    super()
    this.statusElement = document.createElement('span')
    this.statusElement.className = 'inline-block'
  };

  activate() {
    require('atom-package-deps')
      .install('language-cql')
      .then(function () {
        console.log('All dependencies installed, good to go')
      })
    super.activate();
  }

  async startServerProcess() {
    const config = { 'win32': 'win', 'darwin': 'mac', 'linux': 'linux' }[process.platform]
    if (config == null) {
      throw Error(`${this.getServerName()} not supported on ${process.platform}`)
    }

    return this.startLanguageServer();
  }

  async startLanguageServer() {
    console.log('starting language server')
    const command = this.getJavaCommand();

    let javaVersion = await this.checkJavaVersion(command);
    await installServiceIfRequired("cql-language-server", (status) => this.updateInstallStatus(status));
    let jarPath = getJarPath("cql-language-server");
    var args = [
      '-cp',
      jarPath,
      '-Xverify:none', // helps VisualVM avoid 'error 62',
      '-XX:+TieredCompilation',
      '-XX:TieredStopAtLevel=1'
    ]

    if (this.shouldDebug()) {
      args.push('-Xdebug');
      args.push('-Xrunjdwp:transport=dt_socket,server=y,suspend=n,address=5052,quiet=y');
    }

    args.push('org.opencds.cqf.cql.ls.Main');

    this.logger.debug(`starting "${command} ${args.join(' ')}"`)
    const childProcess = cp.spawn(command, args);
    childProcess.on('close', exitCode => {
      if (!childProcess.killed) {
        atom.notifications.addError('CQL language server stopped unexpectedly.', {
          dismissable: true,
          description: this.processStdErr ? `<code>${this.processStdErr}</code>` : `Exit code ${exitCode}`
        })
      }
      this.updateStatusBar('Stopped')
    });
    return childProcess
  }

  async ensureCQLService(connection) {
    console.log('loading CQL service');
    await installServiceIfRequired("cql-evaluator", (status) => this.updateInstallStatus(status));
    this.addCQLExecuteMenu(connection);
  }

  async ensureCqfTooling(connection) {
    console.log('loading CQF Tooling');
    await installServiceIfRequired("cqf-tooling", (status) => this.updateInstallStatus(status));
    this.addRefreshIGMenu(connection);
    this.addRefreshLibraryMenu(connection);
  }

  updateInstallStatus(status) {
    const isComplete = status === 'installed'
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

  mkDirByPathSync(targetDir, { isRelativeToScript = false } = {}) {
    const sep = path.sep;
    const initDir = path.isAbsolute(targetDir) ? sep : '';
    const baseDir = isRelativeToScript ? __dirname : '.';

    return targetDir.split(sep).reduce((parentDir, childDir) => {
      const curDir = path.resolve(baseDir, parentDir, childDir);
      try {
        fs.mkdirSync(curDir);
      } catch (err) {
        if (err.code === 'EEXIST') { // curDir already exists!
          return curDir;
        }

        // To avoid `EISDIR` error on Mac and `EACCES`-->`ENOENT` and `EPERM` on Windows.
        if (err.code === 'ENOENT') { // Throw the original parentDir error on curDir `ENOENT` failure.
          throw new Error(`EACCES: permission denied, mkdir '${parentDir}'`);
        }

        const caughtErr = ['EACCES', 'EPERM', 'EISDIR'].indexOf(err.code) > -1;
        if (!caughtErr || caughtErr && curDir === path.resolve(targetDir)) {
          throw err; // Throw if it's just the last created dir.
        }
      }

      return curDir;
    }, initDir);
  }

  checkJavaVersion(command) {
    return new Promise((resolve, reject) => {
      const childProcess = cp.spawn(command, ['-showversion', '-version'])
      childProcess.on('error', err => {
        this.showJavaRequirements(
          'language-cql could not launch your Java runtime.',
          err.code == 'ENOENT'
            ? `No Java runtime found at <b>${command}</b>.`
            : `Could not spawn the Java runtime <b>${command}</b>.`
        )
        reject()
      })
      let stdErr = '', stdOut = ''
      childProcess.stderr.on('data', chunk => stdErr += chunk.toString())
      childProcess.stdout.on('data', chunk => stdOut += chunk.toString())
      childProcess.on('close', exitCode => {
        const output = stdErr + '\n' + stdOut
        if (exitCode === 0 && output.length > 2) {
          const version = this.getJavaVersionFromOutput(output)
          if (version == null) {
            this.showJavaRequirements(
              `language-cql requires Java ${minJavaRuntime} but could not determine your Java version.`,
              `Could not parse the Java '--showVersion' output <pre>${output}</pre>.`
            )
            reject()
          }
          if (version >= minJavaRuntime) {
            this.logger.debug(`Using Java ${version} from ${command}`)
            resolve(version)
          } else {
            this.showJavaRequirements(
              `language-cql requires Java ${minJavaRuntime} or later but found ${version}`,
              `If you have Java ${minJavaRuntime} installed please Set Java Path correctly. If you do not please Download Java ${minJavaRuntime} or later and install it.`
            )
            reject()
          }
        } else {
          atom.notifications.addError('language-cql encountered an error using the Java runtime.', {
            dismissable: true,
            description: stdErr != '' ? `<code>${stdErr}</code>` : `Exit code ${exitCode}`
          })
          reject()
        }
      })
    })
  }

  getJavaVersionFromOutput(output) {
    const match = output.match(/ version "(\d+(.\d+)?)(.\d+)*(_\d+)?(?:-\w+)?"/)
    return match != null && match.length > 0 ? Number(match[1]) : null
  }

  showJavaRequirements(title, description) {
    atom.notifications.addError(title, {
      dismissable: true,
      buttons: [
        { text: 'Set Java Path', onDidClick: () => shell.openExternal('https://www.java.com/en/download/help/path.xml') },
        { text: 'Download OpenJDK', onDidClick: () => shell.openExternal('https://adoptopenjdk.net/?variant=openjdk11&jvmVariant=openj9') },
      ],
      description: `${description}<p>If you have Java installed please Set Java Path correctly. If you do not please Download Java ${minJavaRuntime} or later and install it.</p>`
    })
  }

  getJavaCommand() {
    const javaPath = this.getJavaPath()
    return javaPath == null ? 'java' : path.join(javaPath, 'bin', 'java')
  }

  getJavaPath() {
    return (new Array(
      atom.config.get('ide-java.javaHome'),
      process.env['JDK_HOME'],
      process.env['JAVA_HOME'])
    ).find(j => j)
  }

  // getOrCreateDataDir (projectPath) {
  //   const dataDir = path.join(os.tmpdir(), `atom-java-${encodeURIComponent(projectPath)}`)
  //   return this.fileExists(dataDir)
  //     .then(exists => { if (!exists) fs.mkdirSync(dataDir, { recursive: true }) })
  //     .then(() => dataDir)
  // }

  preInitialization(connection) {
    connection.onCustom('language/status', (e) => this.updateStatusBar(`${e.type.replace(/^Started$/, '')} ${e.message}`))
    connection.onCustom('language/actionableNotification', this.actionableNotification.bind(this))
  }

  postInitialization(connection) {
    this.addViewELMMenu(connection);
    this.ensureCQLService(connection);
    // this.ensureCqfTooling(connection);
  }

  addRefreshLibraryMenu(connection) {
    const refreshLibraryCommand = atom.commands.add(
      '.tree-view .file .name[data-name$=".cql"]',
      'language-cql:refreshLibrary',
      async (e) => {
        this.refreshCql(e.currentTarget);
      }
    );

    atom.contextMenu.add({
      '.tree-view .file .name[data-name$=".cql"]': [
        {
          label: 'IG Operations',
          submenu: [{
            label: "Refresh",
            command: 'language-cql:refreshLibrary'
          }]
        },
        {
          type: 'separator'
        }
      ]
    });

    connection.disposable.add(refreshLibraryCommand);

  }

  addRefreshIGMenu(connection) {
    const refreshIgCommand = atom.commands.add(
      '.tree-view .file .name[data-name$="ig.ini"]',
      'language-cql:refreshIg',
      async (e) => {
        this.refreshIg(e.currentTarget)
      }
    );

    atom.contextMenu.add({
      '.tree-view .file .name[data-name$="ig.ini"]': [
        {
          label: 'IG Operations',
          submenu: [{
            label: "Refresh",
            command: 'language-cql:refreshIg'
          }]
        },
        {
          type: 'separator'
        }
      ]
    });

    connection.disposable.add(refreshIgCommand);
  }

  addViewELMMenu(connection) {
    const viewELMCommand = atom.commands.add(
      'atom-text-editor',
      'language-cql:viewELM',
      async (e) => {
        this.viewELM(e.currentTarget)
      }
    );

    atom.contextMenu.add({
      'atom-text-editor': [
        {
          type: 'separator'
        },
        {
          label: 'CQL',
          submenu: [{
            label: "View ELM",
            command: 'language-cql:viewELM'
          }],
          shouldDisplay: async (e) => { atom.workspace.getActiveTextEditor().getGrammar().name == "CQL" }
        }]
    });

    connection.disposable.add(viewELMCommand);
  }

  addCQLExecuteMenu(connection) {
    const executeCQLCommand = atom.commands.add(
      'atom-text-editor',
      'language-cql:executeCQLFile',
      async (e) => {
        this.executeCQLFile(e.currentTarget, false)
      }
    );

    atom.contextMenu.add({
      'atom-text-editor': [
        {
          type: 'separator'
        },
        {
          label: 'CQL',
          submenu: [{
            label: "Execute CQL",
            command: 'language-cql:executeCQLFile'
          }],
          shouldDisplay: async (e) => { atom.workspace.getActiveTextEditor().getGrammar().name == "CQL" }
        }]
    });
    connection.disposable.add(executeCQLCommand);

    const executeCQLCommandVerbose = atom.commands.add(
      'atom-text-editor',
      'language-cql:executeCQLFileVerbose',
      async (e) => {
        this.executeCQLFile(e.currentTarget, true)
      }
    );

    atom.contextMenu.add({
      'atom-text-editor': [
        {
          type: 'separator'
        },
        {
          label: 'CQL',
          submenu: [{
            label: "Execute CQL (verbose)",
            command: 'language-cql:executeCQLFileVerbose'
          }],
          shouldDisplay: async (e) => { atom.workspace.getActiveTextEditor().getGrammar().name == "CQL" }

        }]
    });
    connection.disposable.add(executeCQLCommandVerbose);
  }

  updateStatusBar(text) {
    this.statusElement.textContent = `${text}`
    if (!this.statusTile && this.statusBar) {
      this.statusTile = this.statusBar.addRightTile({ item: this.statusElement, priority: 1000 })
    }
  }

  actionableNotification(notification) {
    // if (notification.message.startsWith('Classpath is incomplete.')) {
    //   switch(atom.config.get('ide-java.errors.incompleteClasspathSeverity')) {
    //     case 'ignore': return
    //     case 'error': {
    //       notification.severity = 1
    //       break
    //     }
    //     case 'warning': {
    //       notification.severity = 2
    //       break
    //     }
    //     case 'info': {
    //       notification.severity = 3
    //       break
    //     }
    //   }
    //}

    const options = { dismissable: true, detail: this.getServerName() }
    if (Array.isArray(notification.commands)) {
      options.buttons = notification.commands.map(c => ({ text: c.title, onDidClick: (e) => onActionableButton(e, c.command) }))
      // TODO: Deal with the actions
    }

    const notificationDialog = this.createNotification(notification.severity, notification.message, options)

    const onActionableButton = (event, commandName) => {
      // TODO: add atom side commands in response to notifications
      // const commandFunction = this.commands[commandName]
      // if (commandFunction != null) {
      //   commandFunction()
      // } else {
      //   console.log(`Unknown actionableNotification command '${commandName}'`)
      // }
      notificationDialog.dismiss()
    }
  }

  createNotification(severity, message, options) {
    switch (severity) {
      case 1: return atom.notifications.addError(message, options)
      case 2: return atom.notifications.addWarning(message, options)
      case 3: return atom.notifications.addInfo(message, options)
      case 4: console.log(message)
    }
  }

  consumeStatusBar(statusBar) {
    this.statusBar = statusBar
  }

  async viewELM(editor) {
    const path = convert.default.pathToUri(editor.getModel().getPath());
    const connection = await this.getConnectionForEditor(editor.getModel());
    const result = await connection.executeCommand({ command: 'Other.ViewXML', arguments: [path] });
    atom.workspace.open().then(async (newPane) => await newPane.insertText(result));
  }

  async refreshCql(target) {
    const jarPath = getJarPath("cqf-tooling");
    const command = this.getJavaCommand();

    const cqlPath = target.dataset.path;

    var args = [];
    args.push('-jar');
    args.push(jarPath);
    args.push('-RefreshLibrary');
    args.push(`"-cql=${cqlPath}"`);

    cp.exec(`"${command}" ${args.join(' ')}`, async (error, stdout, stderr) => {
      const endExecution = new Date();
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
    const jarPath = getJarPath("cqf-tooling");
    const command = this.getJavaCommand();

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
      const endExecution = new Date();
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

  async executeCQLFile(editor, verbose) {
    const jarPath = getJarPath("cql-evaluator");
    const command = this.getJavaCommand();

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
    var fhirVersion = "R4";
    const modelTypeSpecifier = modelType + '=';
    const measurementPeriod = ''
    const contextType = 'Patient';
    const contextTypeSpecifier = contextType + '=';
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
      atom.notifications.addInfo("Unable to determine version of FHIR used. Defaulting to R4.", { dismissable: true });
    }


    // Recursively creates directory
    this.mkDirByPathSync(resultPath);

    const modelRootPath = this.getModelRootPath(testPath, libraryPathName);

    var textEditor = await atom.workspace.open(`${path.join(resultPath, libraryPathName + '.txt')}`, {
      cursorBlink: false,
      visualBell: true,
      convertEol: true,
      termName: 'xterm-256color',
      scrollback: 1000,
      rows: 8
    });

    await textEditor.moveToBottom();
    var modelMessage = (modelRootPath && modelRootPath != '') ? `Data path: ${modelRootPath}` : `No tests found at ${testPath}. Evaluation may fail if data is required.`
    var terminologyMessage = (terminologyPath && terminologyPath != '') ? `Terminology path: ${terminologyPath}` : "No terminology path specified. Evaluation may fail if terminology is required."
    await textEditor.insertText('Running tests.\r\n');
    await textEditor.insertText(`${modelMessage}\r\n`);
    await textEditor.insertText(`${terminologyMessage}\r\n`);

    if (modelRootPath && modelRootPath != '') {
      var dirs = fs.readdirSync(modelRootPath, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())

      if (dirs && dirs.length > 0) {
        dirs.forEach(async (dirent) => {
          const context = dirent.name;
          const modelPathSpecifier = modelTypeSpecifier + fileUrl(path.join(modelRootPath, dirent.name));
          const contextSpecifier = contextTypeSpecifier + context;
          await this.executeCQL(textEditor, editor, command, jarPath, libraryDirectory, libraryName, fhirVersion, modelPathSpecifier, terminologyPath, contextSpecifier, context, measurementPeriod, verbose);
        });
      }
      else {
        await this.executeCQL(textEditor, editor, command, jarPath, libraryDirectory, libraryName, fhirVersion, null, terminologyPath, null, null, measurementPeriod, verbose);
      }
    }
    else {
      await this.executeCQL(textEditor, editor, command, jarPath, libraryDirectory, libraryName, fhirVersion, null, terminologyPath, null, null, measurementPeriod, verbose);
    }
  }

  getModelRootPath(parentPath, libraryPathName) {
    var modelRootPath = '';
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
    return modelRootPath;
  }

  async executeCQL(textEditor, editor, command, jarPath, libraryDirectory, libraryName, fhirVersion, modelPathSpecifier, terminologyPath, contextSpecifier, testName, measurementPeriod, verbose) {
    const args = this.getExecArgs(jarPath, libraryDirectory, libraryName, fhirVersion, modelPathSpecifier, terminologyPath, contextSpecifier, measurementPeriod, verbose, this.shouldDebug());
    console.log(command + ' ' + args.join(' '));

    if (!testName) {
      testName = "AdHoc";
    }

    const startExecution = new Date();
    cp.exec(`"${command}" ${args.join(' ')}`, async (error, stdout, stderr) => {
      const endExecution = new Date();
      if (error) {
        //console.error(`exec error: ${error}`);
        handleJarError(error, jarPath);
        //this results display should be in the caller, but I keep getting a null from the promise that's returned
        await textEditor.insertText(`Test (${testName})\r\n${new Date().toString()}\r\n${error}\r\n`);
        return;
      }
      if (stderr && stderr.length > 0) {
        console.error(`stderr: ${stderr}`);
      }
      //this results display should be in the caller, but I keep getting a null from the promise that's returned
      await textEditor.moveToBottom();
      await textEditor.insertText(`Test ${testName}\r\n${startExecution.toString()}\r\n`);
      await textEditor.insertText(`${stdout.toString()}elapsed: ${((endExecution - startExecution) / 1000).toString()} seconds\r\n\r\n`);
    });
  }

  getExecArgs(jarPath, libraryDirectory, libraryName, fhirVersion, modelPathSpecifier, terminologyPath, contextSpecifier, measurementPeriod, verbose, debug) {
    var args = [];
    if (debug) {
      args.push('-Xdebug');
      args.push('-Xrunjdwp:transport=dt_socket,server=y,suspend=y,address=5051,quiet=y')
    }

    args.push('-jar');
    args.push(jarPath);
    args.push('--lu');
    args.push(`"${fileUrl(libraryDirectory)}"`);
    args.push('--ln')
    args.push(libraryName);

    if (fhirVersion && fhirVersion != '') {
      args.push('--fv');
      args.push(`"${fhirVersion}"`)
    }

    if (modelPathSpecifier && modelPathSpecifier != '') {
      args.push('-m');
      args.push(`"${modelPathSpecifier}"`);
    }

    if (terminologyPath && terminologyPath != '') {
      args.push('-t');
      args.push(`"${fileUrl(terminologyPath)}"`);
    }

    if (contextSpecifier && contextSpecifier != '') {
      args.push('-c');
      args.push(contextSpecifier);
    }

    if (measurementPeriod && measurementPeriod != '') {
      args.push('-p');
      args.push(`${libraryName}."Measurement Period"=${measurementPeriod}`);
    }

    // args.push('-v');
    // args.push(`${verbose.toString()}`);

    return args;
  }

  shouldDebug() {
    return false; // atom.config.get('language-cql.toolDebug');
  }
}

module.exports = new CQLLanguageClient();
