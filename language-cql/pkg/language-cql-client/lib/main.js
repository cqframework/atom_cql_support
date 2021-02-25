const { AutoLanguageClient } = require("atom-languageclient");
const cp = require("child_process");
const convert = require('atom-languageclient/build/lib/convert');

const minJavaRuntime = 1.8;

const { installJavaDependencies, getServicePath } = require('language-cql-common/lib/java-service-installer');
const { getJavaCommand, checkJavaVersion } = require("language-cql-common/lib/java-helpers");

const javaDependencies = require('../package.json').javaDependencies;
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
      .install('language-cql-client');
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
    await checkJavaVersion(minJavaRuntime);
    await installJavaDependencies(javaDependencies, (status) => this.updateInstallStatus(status))
    const command = getJavaCommand();
    let jarPath = getServicePath(javaDependencies["cql-language-server"]);
    var args = [
      '-cp',
      jarPath,
      '-Xverify:none', // helps VisualVM avoid 'error 62',
      '-XX:+TieredCompilation',
      '-XX:TieredStopAtLevel=1'
    ]

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

  preInitialization(connection) {
    connection.onCustom('language/status', (e) => this.updateStatusBar(`${e.type.replace(/^Started$/, '')} ${e.message}`))
    connection.onCustom('language/actionableNotification', this.actionableNotification.bind(this))
  }

  postInitialization(connection) {
    this.addViewELMMenu(connection);
  }


  addViewELMMenu(connection) {
    const viewELMCommand = atom.commands.add(
      'atom-text-editor',
      'language-cql-client:viewELM',
      async (e) => {
        this.viewELM(e.currentTarget)
      }
    );

    const viewELMMenu = atom.contextMenu.add({
      'atom-text-editor': [
        {
          type: 'separator'
        },
        {
          label: 'CQL',
          submenu: [{
            label: "View ELM",
            command: 'language-cql-client:viewELM'
          }],
          shouldDisplay: async (e) => { atom.workspace.getActiveTextEditor().getGrammar().name == "CQL" }
        }]
    });

    connection.disposable.add(viewELMMenu);
    connection.disposable.add(viewELMCommand);
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
      case 4: this.logger.debug(message)
    }
  }

  async viewELM(editor) {
    const path = convert.default.pathToUri(editor.getModel().getPath());
    const connection = await this.getConnectionForEditor(editor.getModel());
    const result = await connection.executeCommand({ command: 'Other.ViewXML', arguments: [path] });
    const newEditor = await atom.workspace.open();
    atom.textEditors.setGrammarOverride(newEditor, "text.xml");
    newEditor.insertText(result);
  }

  handleServerStderr(stderr, projectPath) {
    stderr.split('\n').filter((l) => l).forEach((line) => this.logServerProcessLine(line));
  }

  logServerProcessLine(line) {
    if (line.startsWith("INFO")) {
      this.logger.info(line);
    }
    else if (line.startsWith("WARN")) {
      this.logger.warn(line);
    }
    else if (line.startsWith("ERROR")) {
      this.logger.error(line);
    }
    else if (line.startsWith("DEBUG")) {
      this.logger.debug(line)
    }
    else {
      this.logger.log(line);
    }
  }

}

module.exports = new CQLLanguageClient();
