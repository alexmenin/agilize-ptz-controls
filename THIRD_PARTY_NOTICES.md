# Créditos e componentes

**Agilize PTZ Controls** — desenvolvimento das adaptações por **Agilize Soluções Digitais**. Site: https://agilizesolucoesdigitais.com.br

- **Panevo / Dutch Drone Squad / Klaas Schoute**: projeto de origem, licença MIT. Base v0.1.2, commit `cd521330b9f87e1d3d8ce1420fa23195e65adb28`. Veja [LICENSE](LICENSE) e https://github.com/dutchdronesquad/panevo.
- **go2rtc / Alexey Khit**: ponte de vídeo RTSP distribuída com o aplicativo, versão 1.9.14. Origem e licença MIT em [assets/go2rtc](assets/go2rtc/README.md).
- **Electron e Chromium**: runtime do aplicativo; avisos de terceiros acompanham o pacote distribuído.
- **atem-connection** e **pngjs**: comunicação com ATEM e processamento de PNG, respectivamente. As versões estão fixadas no manifesto/lockfile.
- Demais dependências JavaScript e seus autores: consulte `package.json`, `package-lock.json` e as licenças dos respectivos pacotes. A licença MIT do projeto não substitui as licenças dos componentes.

ATEM e Blackmagic Design são nomes de seus respectivos titulares. A integração é independente e não implica patrocínio ou certificação do fabricante.
