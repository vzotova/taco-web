import {
  FerveoVariant,
  initialize,
  SessionStaticSecret,
} from '@nucypher/nucypher-core';
import * as tacoAuth from '@nucypher/taco-auth';
import { USER_ADDRESS_PARAM_DEFAULT } from '@nucypher/taco-auth';
import {
  aliceSecretKeyBytes,
  fakeDkgFlow,
  fakePorterUri,
  fakeProvider,
  fakeTDecFlow,
  mockGetRitualIdFromPublicKey,
  mockTacoDecrypt,
  TEST_CHAIN_ID,
  TEST_SIWE_PARAMS,
} from '@nucypher/test-utils';
import { beforeAll, describe, expect, it } from 'vitest';

import * as taco from '../src';
import { conditions, domains, toBytes } from '../src';
import { ConditionContext } from '../src/conditions/context';

import {
  fakeDkgRitual,
  mockDkgParticipants,
  mockGetActiveRitual,
  mockGetParticipants,
  mockMakeSessionKey,
} from './test-utils';

// Shared test variables
const message = 'this is a secret';
const ownsNFT = new conditions.predefined.erc721.ERC721Ownership({
  contractAddress: '0x1e988ba4692e52Bc50b375bcC8585b95c48AaD77',
  parameters: [3591],
  chain: TEST_CHAIN_ID,
});

describe('taco', () => {
  beforeAll(async () => {
    await initialize();
  });

  it('encrypts and decrypts', async () => {
    const mockedDkg = fakeDkgFlow(FerveoVariant.precomputed, 0, 4, 4);
    const mockedDkgRitual = fakeDkgRitual(mockedDkg);
    const provider = fakeProvider(aliceSecretKeyBytes);
    const signer = provider.getSigner();
    const getFinalizedRitualSpy = mockGetActiveRitual(mockedDkgRitual);

    const messageKit = await taco.encrypt(
      provider,
      domains.DEVNET,
      message,
      ownsNFT,
      mockedDkg.ritualId,
      signer,
    );
    expect(getFinalizedRitualSpy).toHaveBeenCalled();

    const { decryptionShares } = fakeTDecFlow({
      ...mockedDkg,
      message: toBytes(message),
      dkgPublicKey: mockedDkg.dkg.publicKey(),
      thresholdMessageKit: messageKit,
    });
    const { participantSecrets, participants } = await mockDkgParticipants(
      mockedDkg.ritualId,
    );
    const requesterSessionKey = SessionStaticSecret.random();
    const decryptSpy = mockTacoDecrypt(
      mockedDkg.ritualId,
      decryptionShares,
      participantSecrets,
      requesterSessionKey.publicKey(),
    );
    const getParticipantsSpy = mockGetParticipants(participants);
    const sessionKeySpy = mockMakeSessionKey(requesterSessionKey);
    const getRitualIdFromPublicKey = mockGetRitualIdFromPublicKey(
      mockedDkg.ritualId,
    );
    const getRitualSpy = mockGetActiveRitual(mockedDkgRitual);

    const authProvider = new tacoAuth.EIP4361AuthProvider(
      provider,
      signer,
      TEST_SIWE_PARAMS,
    );
    const conditionContext = ConditionContext.fromMessageKit(messageKit);
    conditionContext.addAuthProvider(USER_ADDRESS_PARAM_DEFAULT, authProvider);
    const decryptedMessage = await taco.decrypt(
      provider,
      domains.DEVNET,
      messageKit,
      conditionContext,
      [fakePorterUri],
    );
    expect(decryptedMessage).toEqual(toBytes(message));
    expect(getParticipantsSpy).toHaveBeenCalled();
    expect(sessionKeySpy).toHaveBeenCalled();
    expect(getRitualIdFromPublicKey).toHaveBeenCalled();
    expect(getRitualSpy).toHaveBeenCalled();
    expect(decryptSpy).toHaveBeenCalled();
  });

  it('exposes requested parameters', async () => {
    const mockedDkg = fakeDkgFlow(FerveoVariant.precomputed, 0, 4, 4);
    const mockedDkgRitual = fakeDkgRitual(mockedDkg);
    const provider = fakeProvider(aliceSecretKeyBytes);
    const signer = provider.getSigner();
    const getFinalizedRitualSpy = mockGetActiveRitual(mockedDkgRitual);

    const customParamKey = ':nftId';
    const ownsNFTWithCustomParams =
      new conditions.predefined.erc721.ERC721Ownership({
        contractAddress: '0x1e988ba4692e52Bc50b375bcC8585b95c48AaD77',
        parameters: [customParamKey],
        chain: TEST_CHAIN_ID,
      });

    const messageKit = await taco.encrypt(
      provider,
      domains.DEVNET,
      message,
      ownsNFTWithCustomParams,
      mockedDkg.ritualId,
      signer,
    );
    expect(getFinalizedRitualSpy).toHaveBeenCalled();

    const conditionContext = ConditionContext.fromMessageKit(messageKit);
    const requestedParameters = conditionContext.requestedContextParameters;
    expect(requestedParameters).toEqual(
      new Set([customParamKey, USER_ADDRESS_PARAM_DEFAULT]),
    );
  });
  // test json api condition exposes requested parameters
  it('jsonapi condition exposes requested parameters', async () => {
    const mockedDkg = fakeDkgFlow(FerveoVariant.precomputed, 0, 4, 4);
    const mockedDkgRitual = fakeDkgRitual(mockedDkg);
    const provider = fakeProvider(aliceSecretKeyBytes);
    const signer = provider.getSigner();
    const getFinalizedRitualSpy = mockGetActiveRitual(mockedDkgRitual);

    const jsonApiCondition = new conditions.base.jsonApi.JsonApiCondition({
      endpoint: 'https://api.example.com/:userId/data',
      query: '$.data[?(@.owner == :userAddress)].value',
      authorizationToken: ':authToken',
      returnValueTest: {
        comparator: '==',
        value: true,
      },
    });

    const messageKit = await taco.encrypt(
      provider,
      domains.DEVNET,
      message,
      jsonApiCondition,
      mockedDkg.ritualId,
      signer,
    );
    expect(getFinalizedRitualSpy).toHaveBeenCalled();

    const conditionContext = ConditionContext.fromMessageKit(messageKit);
    const requestedParameters = conditionContext.requestedContextParameters;

    // Verify all context parameters from endpoint, query and authToken are detected
    expect(requestedParameters).toEqual(
      new Set([':userId', ':userAddress', ':authToken']),
    );
  });
  // test json api condition exposes requested parameters
  it('jsonrpc condition exposes requested parameters', async () => {
    const mockedDkg = fakeDkgFlow(FerveoVariant.precomputed, 0, 4, 4);
    const mockedDkgRitual = fakeDkgRitual(mockedDkg);
    const provider = fakeProvider(aliceSecretKeyBytes);
    const signer = provider.getSigner();
    const getFinalizedRitualSpy = mockGetActiveRitual(mockedDkgRitual);

    const jsonRpcCondition = new conditions.base.jsonRpc.JsonRpcCondition({
      endpoint: 'https://math.example.com/:version/simple',
      method: ':methodContextVar',
      params: {
        value1: 42,
        value2: ':value2',
      },
      query: '$.:queryKey',
      authorizationToken: ':authToken',
      returnValueTest: {
        comparator: '==',
        value: ':expectedResult',
      },
    });
    const messageKit = await taco.encrypt(
      provider,
      domains.DEVNET,
      message,
      jsonRpcCondition,
      mockedDkg.ritualId,
      signer,
    );
    expect(getFinalizedRitualSpy).toHaveBeenCalled();

    const conditionContext = ConditionContext.fromMessageKit(messageKit);
    const requestedParameters = conditionContext.requestedContextParameters;

    // Verify all context parameters are detected
    expect(requestedParameters).toEqual(
      new Set([
        ':version',
        ':methodContextVar',
        ':value2',
        ':queryKey',
        ':authToken',
        ':expectedResult',
      ]),
    );
  });
});
