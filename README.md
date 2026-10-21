# TinyWarden

TinyWarden monitors Linux servers through an outbound host agent and installable
monitoring skills. The dashboard brings together server health, observations and
change history. Health is evaluated from the checks configured for each server.

The official skills cover Disk space, Filesystem trim, Package updates, Reboot
status and Services. Compatible skills can be installed without changing app or
host-agent source. Host access is declared by the package and reviewed by an
administrator.

- [Documentation](docs/README.md)
- [Get started](docs/get-started/README.md)
- [Build a skill](docs/build-skills/README.md)
- [Operate an installation](docs/operating/install.md)
- [Official skills](https://github.com/TinyWarden/tinywarden-skills)
- [Contributing](CONTRIBUTING.md)

The application uses Node.js 24, npm 11 and PostgreSQL 18. See
[package.json](package.json) for exact JavaScript dependencies and
[.env.example](.env.example) for configuration names. Authored source is Apache-2.0;
preserve [LICENSE](LICENSE) and [third-party notices](THIRD_PARTY_NOTICES.md).
