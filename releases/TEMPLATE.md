# vMAJOR.MINOR.PATCH

Regras: `RELEASES.md`. Copie para `releases/vMAJOR.MINOR.PATCH.md`.
Sem valores de instalação ou credenciais.

## Resumo

| Campo | Valor |
| --- | --- |
| Situação | Candidata / aprovada / substituída |
| Tags | `vX.Y.Z-rc.N`, `vX.Y.Z` |
| Commit | |
| Versão anterior | |
| Base de comparação (`$BASE`) | Tag anterior |
| Versão mínima de origem | |
| Classe das migrations | `M0` / `M1` / `M2` |
| Janela com escritas suspensas | Não / Sim: duração, o que suspender |

## O que muda

- Para quem opera a instalação:
- Correções:

## Configuração da instalação

Variáveis novas, removidas ou alteradas, só com os nomes. "Nenhuma", se for o caso.

## Migrations

Última migration após esta release: `<versão>`.

| Versão | Classe | Por que tem essa classe | Efeito no catálogo | Recuperação |
| --- | --- | --- | --- | --- |
| | | | | `backend/supabase/rollbacks/…` |

Versão anterior no banco novo: como foi comprovado.

## Recuperação

- Voltar a aplicação: para qual versão, e qual caso de `RELEASES.md`, seção 6.
- O código da aplicação difere da versão anterior? A volta prova compatibilidade
  ou só a troca de imagens?
- Dados gravados pela versão nova que a anterior não enxerga:
- Só para `M2`: plano testado, em ordem, e onde foi ensaiado.

## Verificações além de `RELEASES.md`, seção 5

## Limitações conhecidas
