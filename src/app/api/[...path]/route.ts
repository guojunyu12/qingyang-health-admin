import {proxyFor} from '../../../m05/lib/proxy';
export const dynamic='force-dynamic';
const handler=proxyFor('admin');
export {handler as GET,handler as POST,handler as PUT,handler as PATCH,handler as DELETE};
