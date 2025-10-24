import { ApolloClient, InMemoryCache, HttpLink } from '@apollo/client';

const GRAPHQL_URL = '/graphql'; // relative path, proxied by Next.js

console.log('🔗 Apollo Client configured with URL:', GRAPHQL_URL);

const httpLink = new HttpLink({
  uri: '/graphql', // rewritten by Next -> backend
  credentials: 'include',
  headers: {
    'Content-Type': 'application/json',
    'x-demo-token': process.env.NEXT_PUBLIC_DEMO_TOKEN || '',
  },
});


export const apolloClient = new ApolloClient({
  link: httpLink,
  cache: new InMemoryCache(),
  defaultOptions: {
    watchQuery: { errorPolicy: 'all' },
    query: { errorPolicy: 'all' },
  },
});

export const testGraphQLConnection = async (): Promise<boolean> => {
  try {
    const response = await fetch(GRAPHQL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '{ health }' }),
      credentials: 'include',
    });
    return response.ok;
  } catch (e) {
    console.error('GraphQL connection test failed:', e);
    return false;
  }
};
