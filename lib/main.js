const { AutoLanguageClient } = require("atom-languageclient");
const { install } = require("atom-package-deps");
const path = require('path');
const cp = require("child_process");
const fs = require('fs')
const os = require('os')
const {shell} = require('electron')

const convert = require('atom-languageclient/build/lib/convert');
const minJavaRuntime = 1.8

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
    const projectPath = atom.project.rootDirectories[0].path;
    const options = { 'cwd': projectPath };
    const jarpath = path.join(__dirname, '..', 'language-server', 'fat-jar.jar');
    const command = this.getJavaCommand()
    let javaVersion
	
    return this.checkJavaVersion(command)
      .then(foundJavaVersion => {
        javaVersion = foundJavaVersion
      })
 //   .then(() => this.getOrCreateDataDir(projectPath))
      .then(() => {
      var args = [
          '-cp',
          jarpath,
          '-Xverify:none', // helps VisualVM avoid 'error 62',
          // '-Xdebug',
          // '-Xrunjdwp:transport=dt_socket,server=y,suspend=n,address=5051,quiet=y',
          'org.cqframework.cql.Main'//,
        // projectPath,
        // '-data', dataDir
      ];

      this.logger.debug(`starting "${command} ${args.join(' ')}"`)
      const childProcess = cp.spawn(command, args, options);
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

  checkJavaVersion (command) {
    return new Promise((resolve, reject) => {
      const childProcess = cp.spawn(command, [ '-showversion', '-version' ])
      childProcess.on('error', err => {
        this.showJavaRequirements(
          'IDE-Java could not launch your Java runtime.',
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
              `IDE-Java requires Java ${minJavaRuntime} but could not determine your Java version.`,
              `Could not parse the Java '--showVersion' output <pre>${output}</pre>.`
            )
            reject()
          }
          if (version >= minJavaRuntime) {
            this.logger.debug(`Using Java ${version} from ${command}`)
            resolve(version)
          } else {
            this.showJavaRequirements(
              `IDE-Java requires Java ${minJavaRuntime} or later but found ${version}`,
              `If you have Java ${minJavaRuntime} installed please Set Java Path correctly. If you do not please Download Java ${minJavaRuntime} or later and install it.`
            )
            reject()
          }
        } else {
          atom.notifications.addError('IDE-Java encounted an error using the Java runtime.', {
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
    atom.commands.add(
      'atom-text-editor', 
      'language-cql:viewXML', 
      async (e) => {;
        this.viewXML(e.currentTarget)
      });

    atom.contextMenu.add({
      'atom-text-editor': [
        {
          type : 'separator'
        },
        {
          label: 'CQL',
          submenu: [{
            label: "View XML",
            command: 'language-cql:viewXML'
          }],
          shouldDisplay :  (e) => atom.workspace.getActiveTextEditor().getGrammar().name == "CQL",
      }]
    });
  }
  
  updateStatusBar (text) {
    this.statusElement.textContent = `${this.name} ${text}`
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

  async viewXML(editor) {
    
    const path  = convert.pathToUri(editor.getModel().getPath());
    const connection = await this.getConnectionForEditor(editor.getModel());
    const result = await connection.executeCommand({ command : 'Other.ViewXML', arguments : [ path ]});
    atom.workspace.open().then(newPane =>
          newPane.insertText(result));
  }
}

module.exports = new CQLLanguageClient();
