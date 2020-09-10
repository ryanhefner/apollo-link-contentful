// TypeScript Version: 4.0

import {
  ApolloLink,
  FetchResult,
  Observable,
  Operation,
  NextLink,
} from '@apollo/client'
import { CreateClientParams } from 'contentful'

export declare namespace ContentfulRestLink {
  export interface ClientOptions extends CreateClientParams {
    previewAccessToken?: string;
  }

  export interface QueryDefaults {
    include?: number;
  }
}

export declare class ContentfulRestLink extends ApolloLink {
  private clientOptions?: ContentfulRestLink.ClientOptions;
  private queryDefaults?: ContentfulRestLink.QueryDefaults;

  constructor(
    clientOptions: ContentfulRestLink.ClientOptions,
    queryDefaults?: ContentfulRestLink.QueryDefaults
  );

  request(operation: Operation, forward?: NextLink): Observable<FetchResult> | null;
}
