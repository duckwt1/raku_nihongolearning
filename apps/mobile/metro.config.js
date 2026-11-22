const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Watch workspace packages (@raku/core, @raku/design-tokens, @raku/sync)
config.watchFolders = [monorepoRoot];

// Resolve hoisted dependencies cleanly from both app and monorepo root
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules')
];

config.resolver.unstable_enablePackageExports = true;
// Firebase v11 uses .cjs internals in Metro
if (!config.resolver.sourceExts.includes('cjs')) {
  config.resolver.sourceExts.push('cjs');
}

// Resolve TypeScript ESM relative `.js` imports inside workspace `packages/*`
const upstreamResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = upstreamResolveRequest ?? context.resolveRequest;
  if (
    moduleName.startsWith('.') &&
    moduleName.endsWith('.js') &&
    context.originModulePath.includes(`${path.sep}packages${path.sep}`)
  ) {
    try {
      return resolve(context, moduleName.replace(/\.js$/, '.ts'), platform);
    } catch {
      try {
        return resolve(context, moduleName.replace(/\.js$/, '.tsx'), platform);
      } catch {
        // Fall through to default resolution
      }
    }
  }
  return resolve(context, moduleName, platform);
};

module.exports = config;
