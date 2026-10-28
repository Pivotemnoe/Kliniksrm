#!/usr/bin/env python3
"""Generate the dependency-free Xcode project deterministically; no signing identity is selected."""
from pathlib import Path
import hashlib
import plistlib
import runpy

root = Path(__file__).resolve().parent
if not (root/'Resources/Assets.xcassets/AppIcon.appiconset/StaffIcon.png').exists(): runpy.run_path(str(root/'generate-icon.py'))
def oid(label): return hashlib.sha256(label.encode()).hexdigest()[:24].upper()
def q(value): return '"' + str(value).replace('\\', '\\\\').replace('"', '\\"') + '"'
objects = []
def obj(key, value): objects.append(f'{oid(key)} = {{ {value} }};'); return oid(key)
def ref(key): return oid(key)
def items(values): return '(' + ', '.join(values) + ',)' if values else '()'

targets = [('TemichevVetStaff', 'Sources', 'com.apple.product-type.application', 'app'),
           ('TemichevVetStaffTests', 'Tests', 'com.apple.product-type.bundle.unit-test', 'xctest'),
           ('TemichevVetStaffUITests', 'UITests', 'com.apple.product-type.bundle.ui-testing', 'xctest')]
groups = []; products = []
for name, folder, kind, ext in targets:
    files = []; builds = []
    for file in sorted((root / folder).rglob('*.swift')):
        path = str(file.relative_to(root)); key = 'file:' + path
        files.append(obj(key, f'isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = {q(path)}; sourceTree = "<group>";'))
        builds.append(obj('build:' + path, f'isa = PBXBuildFile; fileRef = {ref(key)};'))
    groups.append(obj('group:' + folder, f'isa = PBXGroup; name = {q(folder)}; children = {items(files)}; sourceTree = "<group>";'))
    product = obj('product:' + name, f'isa = PBXFileReference; explicitFileType = {q("wrapper.application" if ext == "app" else "wrapper.cfbundle")}; includeInIndex = 0; path = {q(name + "." + ext)}; sourceTree = BUILT_PRODUCTS_DIR;')
    products.append(product)
    sources = obj('sources:' + name, f'isa = PBXSourcesBuildPhase; buildActionMask = 2147483647; files = {items(builds)}; runOnlyForDeploymentPostprocessing = 0;')
    frameworks = obj('frameworks:' + name, 'isa = PBXFrameworksBuildPhase; buildActionMask = 2147483647; files = (); runOnlyForDeploymentPostprocessing = 0;')
    resources = []
    if ext == 'app':
        privacy = obj('privacy', 'isa = PBXFileReference; lastKnownFileType = text.xml; path = Resources/PrivacyInfo.xcprivacy; sourceTree = "<group>";')
        resources.append(obj('privacybuild', f'isa = PBXBuildFile; fileRef = {privacy};'))
        groups.append(privacy)
        assets = obj('assets', 'isa = PBXFileReference; lastKnownFileType = folder.assetcatalog; path = Resources/Assets.xcassets; sourceTree = "<group>";')
        resources.append(obj('assetsbuild', f'isa = PBXBuildFile; fileRef = {assets};')); groups.append(assets)
    resourcePhase = obj('resources:' + name, f'isa = PBXResourcesBuildPhase; buildActionMask = 2147483647; files = {items(resources) if resources else "()"}; runOnlyForDeploymentPostprocessing = 0;')
    configs = []
    for config in ['Debug', 'Release']:
        settings = {'PRODUCT_NAME': '$(TARGET_NAME)', 'PRODUCT_BUNDLE_IDENTIFIER': 'ru.temichevvet.staff' + ('' if ext == 'app' else '.' + folder.lower()), 'SWIFT_VERSION': '5.0', 'IPHONEOS_DEPLOYMENT_TARGET': '17.0', 'TARGETED_DEVICE_FAMILY': '1', 'SDKROOT': 'iphoneos', 'SUPPORTED_PLATFORMS': 'iphoneos iphonesimulator', 'CODE_SIGN_STYLE': 'Automatic', 'CURRENT_PROJECT_VERSION': '2', 'MARKETING_VERSION': '0.1.0', 'SWIFT_EMIT_LOC_STRINGS': 'YES', 'ENABLE_USER_SCRIPT_SANDBOXING': 'YES', 'GENERATE_INFOPLIST_FILE': 'YES', 'LD_RUNPATH_SEARCH_PATHS': '$(inherited) @executable_path/Frameworks @loader_path/Frameworks', 'SWIFT_OPTIMIZATION_LEVEL': '-Onone' if config == 'Debug' else '-O', 'SWIFT_ACTIVE_COMPILATION_CONDITIONS': 'DEBUG' if config == 'Debug' else '', 'DEBUG_INFORMATION_FORMAT': 'dwarf' if config == 'Debug' else 'dwarf-with-dsym', 'ENABLE_TESTABILITY': 'YES' if config == 'Debug' else 'NO'}
        if ext == 'app':
            settings.update({'GENERATE_INFOPLIST_FILE': 'NO', 'INFOPLIST_FILE': 'Resources/Info-Debug.plist' if config == 'Debug' else 'Resources/Info.plist', 'CODE_SIGN_ENTITLEMENTS': 'Resources/Staff-Debug.entitlements' if config == 'Debug' else 'Resources/Staff.entitlements'})
            settings['ASSETCATALOG_COMPILER_APPICON_NAME'] = 'AppIcon'
        else:
            settings['TEST_TARGET_NAME'] = 'TemichevVetStaff'
            if folder == 'Tests': settings.update({'BUNDLE_LOADER': '$(TEST_HOST)', 'TEST_HOST': '$(BUILT_PRODUCTS_DIR)/TemichevVetStaff.app/$(BUNDLE_EXECUTABLE_FOLDER_PATH)/TemichevVetStaff'})
        configs.append(obj(f'config:{name}:{config}', 'isa = XCBuildConfiguration; name = ' + config + '; buildSettings = {' + ''.join(f'{k} = {q(v)};' for k,v in settings.items()) + '};'))
    configList = obj('configs:' + name, f'isa = XCConfigurationList; buildConfigurations = {items(configs)}; defaultConfigurationIsVisible = 0; defaultConfigurationName = Release;')
    deps = []
    if ext != 'app':
        proxy = obj('proxy:' + name, f'isa = PBXContainerItemProxy; containerPortal = {ref("project")}; proxyType = 1; remoteGlobalIDString = {ref("target:TemichevVetStaff")}; remoteInfo = TemichevVetStaff;')
        deps.append(obj('dep:' + name, f'isa = PBXTargetDependency; target = {ref("target:TemichevVetStaff")}; targetProxy = {proxy};'))
    obj('target:' + name, f'isa = PBXNativeTarget; buildConfigurationList = {configList}; buildPhases = {items([sources, frameworks, resourcePhase])}; buildRules = (); dependencies = {items(deps) if deps else "()"}; name = {q(name)}; productName = {q(name)}; productReference = {product}; productType = {q(kind)};')
productGroup = obj('products', f'isa = PBXGroup; name = Products; children = {items(products)}; sourceTree = "<group>";')
main = obj('main', f'isa = PBXGroup; children = {items(groups + [productGroup])}; sourceTree = "<group>";')
projectConfigs = [obj('projectconfig:' + name, f'isa = XCBuildConfiguration; name = {name}; buildSettings = {{ CLANG_ENABLE_MODULES = YES; CLANG_ENABLE_OBJC_ARC = YES; }};') for name in ['Debug', 'Release']]
projectList = obj('projectconfigs', f'isa = XCConfigurationList; buildConfigurations = {items(projectConfigs)}; defaultConfigurationIsVisible = 0; defaultConfigurationName = Release;')
obj('project', f'isa = PBXProject; attributes = {{ BuildIndependentTargetsInParallel = YES; LastUpgradeCheck = 2710; }}; buildConfigurationList = {projectList}; compatibilityVersion = "Xcode 14.0"; developmentRegion = ru; knownRegions = (ru, en, Base); mainGroup = {main}; productRefGroup = {productGroup}; projectDirPath = ""; projectRoot = ""; targets = {items([ref("target:" + t[0]) for t in targets])};')
proj = root / 'TemichevVetStaff.xcodeproj'; proj.mkdir(exist_ok=True)
(proj / 'project.pbxproj').write_text('// !$*UTF8*$!\n{ archiveVersion = 1; classes = {}; objectVersion = 56; objects = {\n' + '\n'.join(objects) + '\n}; rootObject = ' + ref('project') + '; }\n')
schemes = proj / 'xcshareddata/xcschemes'; schemes.mkdir(parents=True, exist_ok=True)
def buildable(name): return f'<BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="{ref("target:" + name)}" BuildableName="{name}.{"app" if name == "TemichevVetStaff" else "xctest"}" BlueprintName="{name}" ReferencedContainer="container:TemichevVetStaff.xcodeproj"/>'
(schemes / 'TemichevVetStaff.xcscheme').write_text(f'''<?xml version="1.0" encoding="UTF-8"?>
<Scheme LastUpgradeVersion="2710" version="1.3">
<BuildAction parallelizeBuildables="YES" buildImplicitDependencies="YES"><BuildActionEntries><BuildActionEntry buildForTesting="YES" buildForRunning="YES" buildForProfiling="YES" buildForArchiving="YES" buildForAnalyzing="YES">{buildable('TemichevVetStaff')}</BuildActionEntry></BuildActionEntries></BuildAction>
<TestAction buildConfiguration="Debug" shouldUseLaunchSchemeArgsEnv="YES"><Testables><TestableReference skipped="NO">{buildable('TemichevVetStaffTests')}</TestableReference><TestableReference skipped="NO">{buildable('TemichevVetStaffUITests')}</TestableReference></Testables></TestAction>
<LaunchAction buildConfiguration="Debug" launchStyle="0" useCustomWorkingDirectory="NO" ignoresPersistentStateOnLaunch="NO" debugServiceExtension="internal" allowLocationSimulation="YES"><BuildableProductRunnable runnableDebuggingMode="0">{buildable('TemichevVetStaff')}</BuildableProductRunnable></LaunchAction>
<ProfileAction buildConfiguration="Release" shouldUseLaunchSchemeArgsEnv="YES" useCustomWorkingDirectory="NO"><BuildableProductRunnable runnableDebuggingMode="0">{buildable('TemichevVetStaff')}</BuildableProductRunnable></ProfileAction>
<AnalyzeAction buildConfiguration="Debug"/><ArchiveAction buildConfiguration="Release" revealArchiveInOrganizer="YES"/>
</Scheme>''')
info = {'CFBundleDevelopmentRegion': 'ru', 'CFBundleDisplayName': 'TemichevVet Сотрудники', 'CFBundleExecutable': '$(EXECUTABLE_NAME)', 'CFBundleIdentifier': '$(PRODUCT_BUNDLE_IDENTIFIER)', 'CFBundleInfoDictionaryVersion': '6.0', 'CFBundleName': '$(PRODUCT_NAME)', 'CFBundlePackageType': 'APPL', 'CFBundleShortVersionString': '$(MARKETING_VERSION)', 'CFBundleVersion': '$(CURRENT_PROJECT_VERSION)', 'LSRequiresIPhoneOS': True, 'UILaunchScreen': {}, 'UISupportedInterfaceOrientations': ['UIInterfaceOrientationPortrait'], 'UIApplicationSceneManifest': {'UIApplicationSupportsMultipleScenes': False}, 'NSLocalNetworkUsageDescription': 'Соединение с CRM клиники по указанному вами адресу.'}
for debug in [False, True]:
    current = dict(info)
    current['StaffAPNSEnvironment'] = 'SANDBOX' if debug else 'PRODUCTION'
    current['ITSAppUsesNonExemptEncryption'] = False
    current['StaffCRMServerURL'] = 'https://staff.temichevvet.ru'
    if debug: current['NSAppTransportSecurity'] = {'NSAllowsLocalNetworking': True, 'NSExceptionDomains': {'localhost': {'NSExceptionAllowsInsecureHTTPLoads': True, 'NSIncludesSubdomains': False}, '127.0.0.1': {'NSExceptionAllowsInsecureHTTPLoads': True, 'NSIncludesSubdomains': False}}}
    (root / 'Resources' / ('Info-Debug.plist' if debug else 'Info.plist')).write_bytes(plistlib.dumps(current, sort_keys=False))
    (root / 'Resources' / ('Staff-Debug.entitlements' if debug else 'Staff.entitlements')).write_bytes(plistlib.dumps({'aps-environment': 'development' if debug else 'production'}))
privacy = {'NSPrivacyTracking': False, 'NSPrivacyTrackingDomains': [], 'NSPrivacyCollectedDataTypes': [], 'NSPrivacyAccessedAPITypes': [{'NSPrivacyAccessedAPIType': 'NSPrivacyAccessedAPICategoryUserDefaults', 'NSPrivacyAccessedAPITypeReasons': ['CA92.1']}]}
(root / 'Resources/PrivacyInfo.xcprivacy').write_bytes(plistlib.dumps(privacy))
print(proj)
