// Patrones de ignorado clasificados por stack / tipo de fichero.
const vcsAndOS = [".git/**", ".hg/**", ".svn/**", ".DS_Store", "Thumbs.db"];

const logsAndTemp = [
  "*.log",
  "*.tmp",
  "*.temp",
  "*.bak",
  "*.old",
  "*.swp",
  "*.swo", // Vim
  "*.~", // ed editors
];

const binariesAndMedia = [
  "*.exe",
  "*.dll",
  "*.so",
  "*.dylib",
  "*.bin",
  "*.dat",
  "*.zip",
  "*.tar",
  "*.gz",
  "*.bz2",
  "*.tgz",
  "*.rar",
  "*.7z",
  "*.jpg",
  "*.jpeg",
  "*.png",
  "*.gif",
  "*.bmp",
  "*.ico",
  "*.svg",
  "*.mp3",
  "*.wav",
  "*.flac",
  "*.aac",
  "*.ogg",
  "*.mp4",
  "*.avi",
  "*.mov",
  "*.mkv",
  "*.webm",
  "*.pdf",
  "*.doc",
  "*.docx",
  "*.xls",
  "*.xlsx",
  "*.ppt",
  "*.pptx",
  "*.ttf",
  "*.otf",
  "*.woff",
  "*.woff2",
];

const javascriptNode = [
  "node_modules/**",
  "dist/**",
  "build/**",
  "out/**",
  ".next/**",
  ".nuxt/**",
  ".vuepress/**",
  ".gatsby-cache/**",
  "*.min.*", // minificados
  "coverage/**",
  ".nyc_output/**",
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "*.bundle.js",
  "*.chunk.js",
  "*.map",
  ".eslintcache",
  ".cache/", // babel, parcel, etc.
];

const python = [
  "__pycache__/**",
  ".pytest_cache/**",
  ".mypy_cache/**",
  "*.py[cod]",
  "*.pyd",
  "*.egg",
  "*.egg-info/**",
  "*.whl",
  ".venv/**",
  "venv/**",
];

const php = [
  "vendor/**",
  "composer.lock",
  "*.phar",
  "*.phps",
  "*.phpt",
  ".phpunit.result.cache",
];

const java = [
  "*.class",
  "*.jar",
  "*.war",
  "*.ear",
  "target/**",
  ".gradle/**",
  ".mvn/**",
  "hs_err_pid*.log",
];

const dotnet = [
  "bin/**",
  "obj/**",
  "*.dll",
  "*.pdb",
  "*.exe",
  "*.mdb",
  "*.suo",
  "*.user",
  "*.userosscache",
  "*.sln.docstates",
  ".vs/**",
  "packages/**",
];

const golang = [
  "vendor/**",
  "*.test",
  "*.exe",
  "*.out",
  "*.a",
  "*.mod",
  "*.sum",
];

const rust = ["target/**", "Cargo.lock"];

const cpp = [
  "*.o",
  "*.obj",
  "*.so",
  "*.a",
  "*.lib",
  "*.dSYM/**", // macOS debug
  "build/**",
  "cmake-build-debug/**",
];

const swift = [
  "DerivedData/**",
  "*.xcodeproj/**",
  "*.xcworkspace/**",
  "*.xcuserstate",
  "Pods/**",
];

const android = ["build/**", "app/build/**", "*.apk", "*.aab"];

const terraform = [".terraform/**", "*.tfstate", "*.tfstate.*", "*.tfvars"];

const docker = [
  "Dockerfile.*.swp",
  "docker-compose.override.yml",
  ".docker/**",
];

const kubernetes = ["kubeconfig", "*.kube/*.yaml"];

const infra = [
  ".idea/**",
  "*.iml", // IntelliJ
  ".vscode/**",
  ".cache/**",
  ".history/**",
  ".env.local",
  ".env.*.local",
];

export const defaultIgnorePatterns: string[] = [
  ...vcsAndOS,
  ...logsAndTemp,
  ...binariesAndMedia,
  ...javascriptNode,
  ...python,
  ...php,
  ...java,
  ...dotnet,
  ...golang,
  ...rust,
  ...cpp,
  ...swift,
  ...android,
  ...terraform,
  ...docker,
  ...kubernetes,
  ...infra,
];
