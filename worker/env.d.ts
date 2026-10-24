declare namespace Cloudflare {
  interface Env {
    // Hosting may inject this binding; local builds can run without a database.
    DB?: D1Database;
  }
}
