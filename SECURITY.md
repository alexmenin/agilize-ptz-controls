# Segurança e dados locais

O servidor de controle pelo celular foi projetado para uma **rede local confiável**. Não há login de operador. Quem possui acesso à rede de controle pode enviar comandos; não exponha a porta diretamente à internet.

Credenciais ONVIF/RTSP, configurações de rede, miniaturas e artes pertencem à instalação local. Não são necessárias no código-fonte público. As configurações locais não devem ser tratadas como um cofre de senhas: restrinja o acesso à conta e aos backups do computador.

Antes de enviar um diagnóstico ou exportação, remova senhas, tokens, endereços de rede sensíveis, números de série e URLs com credenciais. Não publique `.env`, chaves privadas, `panevo-config.json`, `atem-integration.json` ou cópias da pasta de dados. O `.gitignore` ajuda a evitar inclusões acidentais, mas não substitui revisão.

Os exemplos e testes usam dados fictícios. Não use suas senhas reais em testes ou capturas de tela.

Para uma falha que envolva segurança, utilize um canal privado de contato disponível no site [Agilize Soluções Digitais](https://agilizesolucoesdigitais.com.br). Não abra uma issue pública contendo credenciais ou detalhes de uma instalação exposta.

Os binários desta versão não são assinados digitalmente. Baixe-os da release do projeto e confira o SHA-256 publicado. Checksums verificam a integridade em relação ao arquivo publicado; não substituem uma assinatura de editor.
