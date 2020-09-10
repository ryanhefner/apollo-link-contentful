// TypeScript Version: 4.0

import {
  ApolloLink,
  FetchResult,
  Observable,
  Operation,
  NextLink,
} from '@apollo/client'
import { ContentfulClientApi, CreateClientParams } from 'contentful'

export declare namespace ContentfulRestLink {
  export interface ClientOptions extends CreateClientParams {
    previewAccessToken?: string;
  }

  export interface QueryDefaults {
    include?: number;
  }
}

export declare class ContentfulRestLink extends ApolloLink {
  public clientOptions?: ContentfulRestLink.ClientOptions;
  public queryDefaults?: ContentfulRestLink.QueryDefaults;
  public client?: ContentfulClientApi;
  public previewClient?: ContentfulClientApi;

  constructor(
    clientOptions: ContentfulRestLink.ClientOptions,
    queryDefaults?: ContentfulRestLink.QueryDefaults
  );

  request(operation: Operation, forward?: NextLink): Observable<FetchResult> | null;
}
