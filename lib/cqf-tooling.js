
const { installServiceIfRequired, getServicePath, handleJarError } = require('./java-service-installer');

const { getJavaCommand } = require('./java-helpers');

const cp = require("child_process");

function addRefreshLibraryMenu(connection) {
    const refreshLibraryCommand = atom.commands.add(
        '.tree-view .file .name[data-name$=".cql"]',
        'language-cql:refreshLibrary',
        async (e) => {
            refreshCql(e.currentTarget);
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

function addRefreshIGMenu(connection) {
    const refreshIgCommand = atom.commands.add(
        '.tree-view .file .name[data-name$="ig.ini"]',
        'language-cql:refreshIg',
        async (e) => {
            refreshIg(e.currentTarget)
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

async function ensureCqfTooling(connection, updateInstallCallback) {
    // Disabled until this is hardened a bit more
    // console.log('loading CQF Tooling');
    // await installServiceIfRequired("cqf-tooling", updateInstallCallback);
    // addRefreshIGMenu(connection);
    // addRefreshLibraryMenu(connection);
}


async function refreshCql(target) {
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

async function refreshIg(target) {
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

module.exports.ensureCqfTooling = ensureCqfTooling;