const fs = require('fs');
const path  = require('path');
const FeatureLoader = require('nuclide-commons-atom/FeatureLoader');

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
featureLoader._pkgName="language-cql";
featureLoader.load();

module.exports = {
    config: featureLoader.getConfig(),
    activate() {
        featureLoader.activate();
    },
    deactivate() {
        featureLoader.deactivate();
    },
    serialize() {
        featureLoader.serialize();
    },
};
