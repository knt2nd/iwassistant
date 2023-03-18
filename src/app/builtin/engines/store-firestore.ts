import { Firestore } from '@google-cloud/firestore';
import { join } from 'node:path';

export type Config = {
  /**
   * Path of service account JSON
   * @default "./secrets/google-cloud.json"
   * @see https://cloud.google.com/firestore/docs/create-database-server-client-library
   */
  secret: string;
  /**
   * Collection name
   * @default "iwassistant-1"
   */
  id: string;
};

export const engine: IEngine<Config> = {
  name: 'store-firestore',
  description: 'Google Cloud Firestore',
  config: {
    secret: join(__dirname, '../../../../secrets/google-cloud.json'),
    id: 'iwassistant-1',
  },
  createStore({ config }) {
    const store = new Firestore({ keyFilename: config.secret });
    return {
      async get(key) {
        const doc = await store.doc(`${config.id}/${key}`).get();
        return doc.data();
      },
      async set(key, value) {
        await store.doc(`${config.id}/${key}`).set(value);
        return true;
      },
    };
  },
};
