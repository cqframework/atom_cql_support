const fs = require('fs');
const path = require('path');
const FeatureLoader = require('nuclide-commons-atom/FeatureLoader');

const packageJson = require('./package.json');
const configDir = path.join(__dirname, 'language-cql/config');
const jarDir = path.join(__dirname, 'language-cql/jars');

const featureDir = path.join(__dirname, 'language-cql/pkg');
const features = fs
    .readdirSync(featureDir)
    .map(item => {
        const dirname = path.join(featureDir, item);
        try {
            const pkgJson = fs.readFileSync(
                path.join(dirname, 'package.json'),
                'utf8',
            );
            return {
                path: dirname,
                pkg: JSON.parse(pkgJson),
            };
        } catch (err) {
            if (err.code !== 'ENOENT' && err.code !== 'ENOTDIR') {
                throw err;
            }
        }
    })
    .filter(Boolean);

const featureLoader = new FeatureLoader.default({
    path: __dirname,
    config: {},
    features,
});

// Hack for the root directory not being named "language-cql"
featureLoader._pkgName = "language-cql";
featureLoader.load();

function checkUpgrade() {
    const versionFileName = path.join(configDir, 'version');
    let lastVersion = ""
    if (fs.existsSync(versionFileName)) {
        lastVersion = fs.readFileSync(versionFileName, 'utf8',);
    }
    else {
        try {
            fs.mkdirSync(configDir, { recursive: true });
        }
        catch (err) {
            let e = new Error(`Error creating necessary config files:\n"${err.message}"\nThe language-cql plugin requires write permissions. Check to ensure that your Atom installation is not read only, or blocked by anti-virus software.`)
            e.original = err
            e.stack = e.stack.split('\n').slice(0, 2).join('\n') + '\n' +
                err.stack
            throw e
        }
    }

    const currentVersion = packageJson.version;
    if (lastVersion != currentVersion) {
        doUpgrade();
        try {
            fs.writeFileSync(versionFileName, currentVersion, { encoding: 'utf8', flag: 'w' })
        }
        catch (err) {
            let e = new Error(`Error creating necessary config directories:\n"${err.message}"\nThe language-cql plugin requires write permissions. Check to ensure that your Atom installation is not read only, or blocked by anti-virus software.`)
            e.original = err
            e.stack = e.stack.split('\n').slice(0, 2).join('\n') + '\n' +
                err.stack
            throw e
        }
    }

}

function doUpgrade() {
    rimraf(jarDir);
}

function rimraf(dir_path) {
    if (fs.existsSync(dir_path)) {
        fs.readdirSync(dir_path).forEach(function(entry) {
            var entry_path = path.join(dir_path, entry);
            if (fs.lstatSync(entry_path).isDirectory()) {
                rimraf(entry_path);
            } else {
                fs.unlinkSync(entry_path);
            }
        });
        fs.rmdirSync(dir_path);
    }
}

module.exports = {
    config: featureLoader.getConfig(),
    activate() {
        checkUpgrade();
        featureLoader.activate();
    },
    deactivate() {
        featureLoader.deactivate();
    },
    serialize() {
        featureLoader.serialize();
    },
};
