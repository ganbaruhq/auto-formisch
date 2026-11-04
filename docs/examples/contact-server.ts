// #region server
import { compile } from '@auto-formisch/core';
import definition from './contact.json';
import { saveContact } from './app';

const form = compile(definition);

export async function handleContact(request: Request): Promise<Response> {
  const result = form['~standard'].validate(await request.json());
  if (result.issues) return Response.json({ errors: result.issues }, { status: 422 });
  await saveContact(result.value);
  return new Response(null, { status: 204 });
}
// #endregion server
