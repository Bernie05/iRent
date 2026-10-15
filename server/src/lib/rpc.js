import { getSupabaseAdmin } from './supabase.js';
import { mapDbError } from './dbErrors.js';

/**
 * Call a Postgres function (RPC) with the service-role client.
 * Errors are mapped to catalogue AppErrors (B1 mapDbError).
 * @param {string} name   function name in schema public
 * @param {object} args   named arguments (p_*)
 */
export async function callRpc(name, args = {}, client = getSupabaseAdmin()) {
  const { data, error } = await client.rpc(name, args);
  if (error) throw mapDbError(error);
  return data;
}
