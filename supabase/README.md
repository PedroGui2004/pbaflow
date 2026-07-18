# Ativacao do backend do PBA Flow

1. Conecte o projeto ao **Lovable Cloud** (ou a um projeto Supabase).
2. Execute a migracao em `supabase/migrations/202607180001_gpj_foundation.sql`.
3. Cadastre os usuarios no painel de autenticacao.
4. O primeiro acesso cria cada perfil como `technician`. Promova somente os usuarios autorizados:

   ```sql
   update public.profiles
   set role = 'manager'
   where email = 'gestor@empresa.com.br';

   update public.profiles
   set role = 'developer'
   where email = 'desenvolvedor@empresa.com.br';
   ```

5. Configure no ambiente do Lovable:

   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`

O sistema passa a exigir login quando as duas variaveis estao configuradas. Sem elas, a interface continua disponivel localmente para desenvolvimento, mas nao deve ser usada como base oficial da fabrica.

## Perfis

- `technician`: operacao de reparo, KVM, vinculos e catalogos.
- `manager`: operacao completa, indicadores, alertas e consulta de auditoria.
- `developer`: mesmas permissoes gerenciais e configuracoes de integracao/canais.

Todas as alteracoes operacionais sao registradas em `audit_log`. Essa tabela nao oferece permissao de alteracao ou exclusao aos usuarios do sistema.
