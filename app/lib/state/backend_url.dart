/// Mutable holder so a backend-URL change in settings applies immediately
/// (the URL is a public endpoint, not a secret).
class BackendUrlHolder {
  BackendUrlHolder(this.url);
  String url;
}
