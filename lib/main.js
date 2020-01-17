const { AutoLanguageClient, DownloadFile } = require("atom-languageclient");
const { install } = require("atom-package-deps");
const path = require('path');
const cp = require("child_process");
const fs = require('fs');
const os = require('os');
var request = require('request-promise-native');
const {shell} = require('electron');
const convert = require('atom-languageclient/build/lib/convert');
const minJavaRuntime = 1.8;

var packagejson = require('../package.json');

class CQLLanguageClient extends AutoLanguageClient {
  getGrammarScopes() { return [ "source.cql" ]; }
  getLanguageName() { return "cql"; }
  getServerName() { return "cql-language-server"; }

  constructor () {
    super()
    this.statusElement = document.createElement('span')
    this.statusElement.className = 'inline-block'
  };

  activate() {
    require('atom-package-deps')
    .install('language-cql')
    .then(function() {
      console.log('All dependencies installed, good to go')
    })
    super.activate();
  }

  startServerProcess() {
    const config = { 'win32': 'win', 'darwin': 'mac', 'linux': 'linux' }[process.platform]
    if (config == null) {
      throw Error(`${this.getServerName()} not supported on ${process.platform}`)
    }

    return this.startLanguageServer();
  }

  startLanguageServer() {
    console.log('starting language server')
    const coords = {
      groupId : packagejson.languageServer.groupId,
      artifactId : packagejson.languageServer.artifactId,
      version : packagejson.languageServer.version,
      classifier : packagejson.languageServer.classifier
    };

    const serverHome = path.join(__dirname, '..', 'server');
    const jarName = this.getLocalName(coords);
    const jarPath = path.join(serverHome, jarName);
    const command = this.getJavaCommand();

    let javaVersion;

    return this.checkJavaVersion(command)
      .then(foundJavaVersion => {
        javaVersion = foundJavaVersion;
        return this.installServiceIfRequired(serverHome, coords, "language server");
      })
      .then(() => {
        var args = [
          '-cp',
          jarPath,
          '-Xverify:none', // helps VisualVM avoid 'error 62',
        ]

        if (this.shouldDebug()) {
          args.push('-Xdebug');
          args.push('-Xrunjdwp:transport=dt_socket,server=y,suspend=n,address=5051,quiet=y');
        }

        args.push('org.cqframework.cql.ls.Main');

        this.logger.debug(`starting "${command} ${args.join(' ')}"`)
        const childProcess = cp.spawn(command, args);
        this.captureServerErrors(childProcess);
        childProcess.on('close', exitCode => {
          if (!childProcess.killed) {
            atom.notifications.addError('CQL language server stopped unexpectedly.', {
              dismissable: true,
              description: this.processStdErr ? `<code>${this.processStdErr}</code>` : `Exit code ${exitCode}`
            })
          }
          this.updateStatusBar('Stopped')
        })
        return childProcess
      }
    )
  }

  async ensureCQLService(connection) {
    console.log('loading CQL service');

    const coords = {
      groupId : packagejson.cqlService.groupId,
      artifactId : packagejson.cqlService.artifactId,
      version : packagejson.cqlService.version,
      classifier : packagejson.cqlService.classifier
    };

    const serverHome = path.join(__dirname, '..', 'cli')
    await this.installServiceIfRequired(serverHome, coords, "cql service");
    this.addCQLExecuteMenu(connection);
    global.sharedObj = { resultsTextEditor: null };
  }

  installServiceIfRequired (serverHome, coords, displayName) {
    return this.isServiceInstalled(serverHome, coords)
      .then(doesExist => {
        if (!doesExist)
          return this.installJar(serverHome, coords, displayName);
      });
  }

  isServiceInstalled (serverHome, coords) {
    let localFileName = this.getLocalName(coords);
    return this.fileExists(path.join(serverHome, localFileName))
  }

// Installs a jar using maven coordinates
  installJar(home, coords, displayName) {
    const localFileName = this.getLocalName(coords);
    const localPath = path.join(home, localFileName);
    return this.fileExists(home)
      .then(doesExist => {if (!doesExist) fs.mkdirSync(home, { recursive: true }) })
      .then(() => this.updateInstallStatus(`installing ${displayName}`))
      .then(() => this.setupDownload(this.getSearchUrl(coords.groupId, coords.artifactId, coords.version, coords.classifier), displayName))
      .then(setupInfo => DownloadFile(setupInfo.serverDownloadUrl, localPath, setupInfo.provideInstallStatus, setupInfo.serverDownloadSize))
      .then(() => this.fileExists(localPath))
      .then(doesExist => { if (!doesExist) throw Error(`Failed to install ${displayName}`) })
      .then(() => this.updateInstallStatus(`installed ${displayName}`))
  }

  setupDownload(url, displayName) {
    return new Promise((resolve, reject) => {
      request(url, { followRedirect : false, simple : false, resolveWithFullResponse: true })
        .then((response) => {
           let redirectUrl = response.headers['location'];
           request.head(redirectUrl).then((response) => {
            let length = response['content-length'];
            return  { url : redirectUrl, length : length };
          })
          .then((res) => {
            const bytesToMegabytes = 1024 * 1024;
            const provideInstallStatus = (bytesDone, percent) => {
              this.updateInstallStatus(`CQL not ready... downloading ${displayName} - ${Math.floor(res.length / bytesToMegabytes)} MB (${percent}% done)`)
            }

            resolve( {serverDownloadUrl : res.url, provideInstallStatus : provideInstallStatus, serverDownloadSize : res.length });
          });
        })
    });
  }

  getLocalName(coords) {
    return (coords.artifactId + "-" + coords.version + (coords.classifier ?  ("-" + coords.classifier) : '') + '.jar');
  }

  fileExists (path) {
    return new Promise(resolve => {
      fs.access(path, fs.R_OK, error => {
        resolve(!error || error.code !== 'ENOENT')
      })
    })
  }

  getSearchUrl (groupId, artifactId, version, classifier) {
    let repository = version.toLowerCase().includes("snapshot") ? "snapshots" : "releases";
    return `https://oss.sonatype.org/service/local/artifact/maven/redirect?r=${repository}&g=${groupId}&a=${artifactId}&v=${version}` + (classifier ?
      `&c=${classifier}` : ``);
  }

  updateInstallStatus (status) {
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

  updateStatusBar (text) {
    this.statusElement.textContent = `${this.name} ${text}`
    if (!this.statusTile && this.statusBar) {
      this.statusTile = this.statusBar.addRightTile({ item: this.statusElement, priority: 1000 })
    }
  }

  checkJavaVersion (command) {
    return new Promise((resolve, reject) => {
      const childProcess = cp.spawn(command, [ '-showversion', '-version' ])
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
          atom.notifications.addError('language-cql encounted an error using the Java runtime.', {
            dismissable: true,
            description: stdErr != '' ? `<code>${stdErr}</code>` : `Exit code ${exitCode}`
          })
          reject()
        }
      })
    })
  }

  getJavaVersionFromOutput (output) {
    const match = output.match(/ version "(\d+(.\d+)?)(.\d+)?(_\d+)?(?:-\w+)?"/)
    return match != null && match.length > 0 ? Number(match[1]) : null
  }

  showJavaRequirements (title, description) {
    atom.notifications.addError(title, {
      dismissable: true,
      buttons: [
        { text: 'Set Java Path', onDidClick: () => shell.openExternal('https://www.java.com/en/download/help/path.xml') },
        { text: 'Download Java', onDidClick: () => shell.openExternal('http://www.oracle.com/technetwork/java/javase/downloads/index.html') },
      ],
      description: `${description}<p>If you have Java installed please Set Java Path correctly. If you do not please Download Java ${minJavaRuntime} or later and install it.</p>`
    })
  }

  getJavaCommand () {
    const javaPath = this.getJavaPath()
    return javaPath == null ? 'java' : path.join(javaPath, 'bin', 'java')
  }

  getJavaPath () {
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
          type : 'separator'
        },
        {
          label: 'CQL',
          submenu: [{
            label: "View ELM",
            command: 'language-cql:viewELM'
          }],
          shouldDisplay : async (e) => { atom.workspace.getActiveTextEditor().getGrammar().name == "CQL" }
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
          type : 'separator'
        },
        {
          label: 'CQL',
          submenu: [{
            label: "Execute CQL",
            command: 'language-cql:executeCQLFile'
          }],
          shouldDisplay : async (e) => { atom.workspace.getActiveTextEditor().getGrammar().name == "CQL" }
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
          type : 'separator'
        },
        {
          label: 'CQL',
          submenu: [{
            label: "Execute CQL (verbose)",
            command: 'language-cql:executeCQLFileVerbose'
          }],
          shouldDisplay : async (e) => { atom.workspace.getActiveTextEditor().getGrammar().name == "CQL" }
      }]
    });
    connection.disposable.add(executeCQLCommandVerbose);
  }

  updateStatusBar (text) {
    this.statusElement.textContent = `${text}`
    if (!this.statusTile && this.statusBar) {
      this.statusTile = this.statusBar.addRightTile({ item: this.statusElement, priority: 1000 })
    }
  }

  actionableNotification (notification) {
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

  createNotification (severity, message, options) {
    switch (severity) {
      case 1: return atom.notifications.addError(message, options)
      case 2: return atom.notifications.addWarning(message, options)
      case 3: return atom.notifications.addInfo(message, options)
      case 4: console.log(message)
    }
  }

  consumeStatusBar (statusBar) {
    this.statusBar = statusBar
  }

  async viewELM(editor) {
    const path  = convert.default.pathToUri(editor.getModel().getPath());
    const connection = await this.getConnectionForEditor(editor.getModel());
    const result = await connection.executeCommand({ command : 'Other.ViewXML', arguments : [ path ]});
    atom.workspace.open().then(newPane => newPane.insertText(result));
  }

  async executeCQLFile(editor, verbose) {
    const coords = {
      groupId : packagejson.cqlService.groupId,
      artifactId : packagejson.cqlService.artifactId,
      version : packagejson.cqlService.version,
      classifier : packagejson.cqlService.classifier
    };

    const serverHome = path.join(__dirname, '..', 'cli')
    const jarName = this.getLocalName(coords);
    const jarPath = path.join(serverHome, jarName);
    const command = this.getJavaCommand();

    //convert.default.pathToUri doesn't give a useable format.  Not sure if that's a problem.
    //hope it's not because path handles it.
    const libraryPath = editor.getModel().getPath();
    const libraryPathName = path.basename(libraryPath, '.cql');

//todo: replace with library-uri when it's ready
    const libraryDirectory = path.dirname(libraryPath);
    const libraryName = libraryPathName.split('-')[0];

    var projectPath = '';
    atom.project.getDirectories().forEach(function(dir){
    	if (dir.contains(libraryPath)) {
    		projectPath = dir.path;
    	}
    });

//todo: make this a setting
    var terminologyPath = atom.config.get("language-cql.terminologyServer");
    // Undefined or blank
    if ( (!terminologyPath || /^\s*$/.test(terminologyPath))) {
      terminologyPath = path.join(projectPath, 'resources/valuesets');
    }

//todo: get this working (currently errors with: Index 0 out of bounds for length 0)
    //const measurementPeriod = 'Interval[@2019-01-01T00:00:00.0, @2020-01-01T00:00:00.0)';
    const measurementPeriod = '';
    const modelType = "FHIR";
    const modelTypeSpecifier = modelType + '=';
    const contextType = 'Patient';
    const contextTypeSpecifier = contextType + '=';

    const modelRootPath = this.getModelRootPath(path.join(projectPath, 'tests'), libraryPathName);
    if (modelRootPath == '') {
       throw `Could not find root test directory.  There must be at least one test directory matching the library name: ${libraryPathName}.`;
    }

    atom.workspace.open(`${path.join(projectPath, 'tests', 'results', libraryPathName + '.txt')}`,  {
      cursorBlink: false,
      visualBell: true,
      convertEol: true,
      termName: 'xterm-256color',
      scrollback: 1000,
      rows: 8
    }).then(result => {
      result.moveToBottom();
      result.insertText('Running tests...\r\n');
      global.sharedObj.resultsTextEditor = result;
    });

//todo: implement ability to choose test(s) when multiple
    fs.readdirSync(modelRootPath, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .forEach(dirent => {
        const context = dirent.name;
//this should work, but the cql-cli needs to look for data below the library name
        //const modelPathSpecifier = modelTypeSpecifier + path.join(modelRootPath, context);
        const modelPathSpecifier = modelTypeSpecifier + modelRootPath;
        const contextSpecifier = contextTypeSpecifier + context;
        this.executeCQL(editor, command, jarPath, libraryDirectory, libraryName, modelPathSpecifier, terminologyPath, contextSpecifier, context, measurementPeriod, verbose);
      });
  }

  getModelRootPath(parentPath, libraryPathName){
    var modelRootPath = '';
    fs.readdirSync(parentPath, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .forEach(dirent => {
      if (modelRootPath == ''){
        if (dirent.name == libraryPathName){
          modelRootPath = path.join(parentPath, dirent.name);
        } else {
          modelRootPath = this.getModelRootPath(path.join(parentPath, dirent.name), libraryPathName)
        }
      }
    });
    return modelRootPath;
  }

  async executeCQL(editor, command, jarPath, libraryDirectory, libraryName, modelPathSpecifier, terminologyPath, contextSpecifier, testName, measurementPeriod, verbose){
    const args = this.getExecArgs(jarPath, libraryDirectory, libraryName, modelPathSpecifier, terminologyPath, contextSpecifier, measurementPeriod, verbose, this.shouldDebug());
    console.log(command + ' ' + args.join(' '));
    const connection = await this.getConnectionForEditor(editor.getModel());

    const startExecution = new Date();
    cp.exec(`"${command}" ${args.join(' ')}`, (error, stdout, stderr) => {
      const endExecution = new Date();
      if (error) {
        console.error(`exec error: ${error}`);
        this.handleJarError(error, jarPath);
//this results display should be in the caller, but I keep getting a null from the promise that's returned
        global.sharedObj.resultsTextEditor.insertText(`Test (${testName})\r\n${new Date().toString()}\r\nERROR: see log for details\r\n\r\n`);
        return;
      }
      if (stderr && stderr.length > 0) {
        console.error(`stderr: ${stderr}`);
      }
//this results display should be in the caller, but I keep getting a null from the promise that's returned
      global.sharedObj.resultsTextEditor.moveToBottom();
      global.sharedObj.resultsTextEditor.insertText(`Test ${testName}\r\n${startExecution.toString()}\r\n`);
      global.sharedObj.resultsTextEditor.insertText(`${stdout.toString()}elapsed: ${((endExecution - startExecution) / 1000).toString()} seconds\r\n\r\n`);
    });
  }

  getExecArgs(jarPath, libraryDirectory, libraryName, modelPathSpecifier, terminologyPath, contextSpecifier, measurementPeriod, verbose, debug){
    return [
      debug ? '-Xdebug' : '',
      debug ? '-Xrunjdwp:transport=dt_socket,server=y,suspend=y,address=5051,quiet=y' : '',
      '-Dorg.slf4j.simpleLogger.defaultLogLevel=error',
      '-jar',
      jarPath,
      '--lp',
      `"${libraryDirectory}"`,
      '--ln',
      libraryName,
      '-m',
      `"${modelPathSpecifier}"`,
      '-t',
      terminologyPath,
      '-c',
      contextSpecifier,
      measurementPeriod == '' ? '' : '-p',
      measurementPeriod == '' ? '' : `${libraryName}."Measurement Period"=${measurementPeriod}`,
      '-v',
      `${verbose.toString()}`
    ];
  }

  handleJarError(error, jarPath) {
    if (error.message.includes('Invalid or corrupt jarfile')) {
      console.log(`Removing invalid or corrupt jarfile: ${jarPath}. Try restarting to re-download.`);
      try {
        fs.unlinkSync(jarPath);
      }
      catch (e) {
        console.error(e.message)
      }
    }
  }

  shouldDebug() {
    return atom.config.get('language-cql.toolDebug');
  }
}

module.exports = new CQLLanguageClient();
