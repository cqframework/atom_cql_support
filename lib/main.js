const { AutoLanguageClient } = require("atom-languageclient");
const { install } = require("atom-package-deps");
const path = require('path');
const cp = require("child_process");

class CQLLanguageClient extends AutoLanguageClient {
  getGrammarScopes() { return [ "source.cql" ]; }
  getLanguageName() { return "cql"; }
  getServerName() { return "cql-language-server"; }

  constructor () {
    super()
    this.statusElement = document.createElement('span')
    this.statusElement.className = 'inline-block'
  }

  startServerProcess() {
    const projectPath = atom.project.rootDirectories[0].path;
    const options = { 'cwd': projectPath };
    const command = "java";
    const jarpath = path.join(__dirname, '..', 'language-server', 'fat-jar.jar');

    var args = [
        '-cp',
        jarpath,
        '-Xverify:none', // helps VisualVM avoid 'error 62',
        '-Xdebug',
        '-Xrunjdwp:transport=dt_socket,server=y,suspend=n,address=5051,quiet=y',
        'org.cqframework.cql.Main',
        projectPath
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

  preInitialization(connection) {
    connection.onCustom('language/status', (e) => this.updateStatusBar(`${e.type.replace(/^Started$/, '')} ${e.message}`))
    connection.onCustom('language/actionableNotification', this.actionableNotification.bind(this))
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
}

module.exports = new CQLLanguageClient();
