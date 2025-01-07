import { ChainId } from '@nucypher/shared';
import { describe, expect, it } from 'vitest';

import { ContractCondition } from '../../src/conditions/base/contract';
import { TimeCondition } from '../../src/conditions/base/time';
import {
  CompoundCondition,
  CompoundConditionProps,
  compoundConditionSchema,
  CompoundConditionType,
} from '../../src/conditions/compound-condition';
import {
  testContractConditionObj,
  testJWTConditionObj,
  testRpcConditionObj,
  testSequentialConditionObj,
  testTimeConditionObj,
} from '../test-utils';

describe('validation', () => {
  it.each([
    {
      operator: 'and',
      operands: [testContractConditionObj, testTimeConditionObj],
    },
    {
      operator: 'or',
      operands: [testContractConditionObj, testTimeConditionObj],
    },
    {
      operator: 'not',
      operands: [testContractConditionObj],
    },
  ])('accepts "$operator" operator', ({ operator, operands }) => {
    const conditionObj: CompoundConditionProps = {
      conditionType: CompoundConditionType,
      operator,
      operands,
    };
    const result = CompoundCondition.validate(
      compoundConditionSchema,
      conditionObj,
    );

    expect(result.error).toBeUndefined();
    expect(result.data).toEqual({
      ...conditionObj,
      conditionType: CompoundConditionType,
    });
  });

  it('rejects an invalid operator', () => {
    const result = CompoundCondition.validate(compoundConditionSchema, {
      operator: 'not-an-operator',
      operands: [testRpcConditionObj, testTimeConditionObj],
    });

    expect(result.error).toBeDefined();
    expect(result.data).toBeUndefined();
    expect(result.error?.format()).toMatchObject({
      operator: {
        _errors: [
          "Invalid enum value. Expected 'and' | 'or' | 'not', received 'not-an-operator'",
        ],
      },
    });
  });

  it.each([
    {
      operator: 'and',
      nrOfOperands: 1,
    },
    {
      operator: 'or',
      nrOfOperands: 1,
    },
    {
      operator: 'not',
      nrOfOperands: 2,
    },
  ])(
    'rejects invalid number of operands $nrOfOperands for operator $operator',
    ({ operator, nrOfOperands }) => {
      const result = CompoundCondition.validate(compoundConditionSchema, {
        operator,
        operands: Array(nrOfOperands).fill(testRpcConditionObj),
      });

      expect(result.error).toBeDefined();
      expect(result.data).toBeUndefined();
      expect(result.error?.format()).toMatchObject({
        operands: {
          _errors: [
            `Invalid number of operands ${nrOfOperands} for operator "${operator}"`,
          ],
        },
      });
    },
  );

  it.each([
    {
      operator: 'and',
      numOperands: 6,
    },
    {
      operator: 'or',
      numOperands: 6,
    },
  ])('rejects > max number of operands', ({ operator, numOperands }) => {
    const result = CompoundCondition.validate(compoundConditionSchema, {
      operator,
      operands: Array(numOperands).fill(testContractConditionObj),
    });

    expect(result.error).toBeDefined();
    expect(result.data).toBeUndefined();
    expect(result.error?.format()).toMatchObject({
      operands: {
        _errors: [`Array must contain at most 5 element(s)`],
      },
    });
  });

  it('accepts nested compound conditions', () => {
    const conditionObj = {
      conditionType: CompoundConditionType,
      operator: 'and',
      operands: [
        testContractConditionObj,
        testTimeConditionObj,
        testRpcConditionObj,
        {
          operator: 'or',
          operands: [testTimeConditionObj, testContractConditionObj],
        },
      ],
    };
    const result = CompoundCondition.validate(
      compoundConditionSchema,
      conditionObj,
    );
    expect(result.error).toBeUndefined();
    expect(result.data).toEqual({
      conditionType: CompoundConditionType,
      operator: 'and',
      operands: [
        testContractConditionObj,
        testTimeConditionObj,
        testRpcConditionObj,
        {
          conditionType: CompoundConditionType,
          operator: 'or',
          operands: [testTimeConditionObj, testContractConditionObj],
        },
      ],
    });
  });

  it('accepts nested sequential and compound conditions', () => {
    const conditionObj = {
      conditionType: CompoundConditionType,
      operator: 'or',
      operands: [
        testContractConditionObj,
        testTimeConditionObj,
        testRpcConditionObj,
        {
          operator: 'or',
          operands: [
            testTimeConditionObj,
            testContractConditionObj,
            testJWTConditionObj,
          ],
        },
        testSequentialConditionObj,
      ],
    };
    const result = CompoundCondition.validate(
      compoundConditionSchema,
      conditionObj,
    );
    expect(result.error).toBeUndefined();
    expect(result.data).toEqual({
      conditionType: CompoundConditionType,
      operator: 'or',
      operands: [
        testContractConditionObj,
        testTimeConditionObj,
        testRpcConditionObj,
        {
          conditionType: CompoundConditionType,
          operator: 'or',
          operands: [
            testTimeConditionObj,
            testContractConditionObj,
            testJWTConditionObj,
          ],
        },
        testSequentialConditionObj,
      ],
    });
  });

  it('limits max depth of nested compound condition', () => {
    const result = CompoundCondition.validate(compoundConditionSchema, {
      operator: 'or',
      operands: [
        testRpcConditionObj,
        testContractConditionObj,
        {
          conditionType: CompoundConditionType,
          operator: 'and',
          operands: [
            testTimeConditionObj,
            {
              conditionType: CompoundConditionType,
              operator: 'or',
              operands: [testTimeConditionObj, testRpcConditionObj],
            },
          ],
        },
      ],
    });
    expect(result.error).toBeDefined();
    expect(result.data).toBeUndefined();
    expect(result.error?.format()).toMatchObject({
      operands: {
        _errors: [`Exceeded max nested depth of 2 for multi-condition type`],
      },
    });
  });
  it('limits max depth of nested sequential condition', () => {
    const result = CompoundCondition.validate(compoundConditionSchema, {
      operator: 'or',
      operands: [
        testRpcConditionObj,
        testContractConditionObj,
        {
          conditionType: CompoundConditionType,
          operator: 'not',
          operands: [testSequentialConditionObj],
        },
      ],
    });
    expect(result.error).toBeDefined();
    expect(result.data).toBeUndefined();
    expect(result.error?.format()).toMatchObject({
      operands: {
        _errors: ['Exceeded max nested depth of 2 for multi-condition type'],
      },
    });
  });

  const multichainCondition: CompoundConditionProps = {
    conditionType: CompoundConditionType,
    operator: 'and',
    operands: [
      ChainId.ETHEREUM_MAINNET,
      ChainId.POLYGON,
      ChainId.SEPOLIA,
      ChainId.AMOY,
    ].map((chain) => ({
      ...testRpcConditionObj,
      chain,
    })),
  };

  it('accepts on a valid multichain condition schema', () => {
    const result = CompoundCondition.validate(
      compoundConditionSchema,
      multichainCondition,
    );

    expect(result.error).toBeUndefined();
    expect(result.data).toEqual(multichainCondition);
  });

  it('rejects an invalid multichain condition schema', () => {
    const badMultichainCondition = {
      ...multichainCondition,
      operands: [
        ...multichainCondition.operands,
        {
          // Bad condition
          ...testRpcConditionObj,
          chain: -1,
        },
      ],
    };

    const result = CompoundCondition.validate(
      compoundConditionSchema,
      badMultichainCondition,
    );

    expect(result.error).toBeDefined();
    expect(result.data).toBeUndefined();
  });

  const condObjects = [testContractConditionObj, testTimeConditionObj];
  const conditions = [
    new ContractCondition(testContractConditionObj),
    new TimeCondition(testTimeConditionObj),
  ];
  const mixed = [
    new ContractCondition(testContractConditionObj),
    testTimeConditionObj,
  ];
  it.each([
    ['and', condObjects, condObjects],
    ['and', conditions, condObjects],
    ['and', mixed, condObjects],
    ['or', condObjects, condObjects],
    ['or', conditions, condObjects],
    ['or', mixed, condObjects],
    ['not', condObjects[0], condObjects.slice(0, 1)],
    ['not', conditions[0], condObjects.slice(0, 1)],
    ['not', mixed[0], condObjects.slice(0, 1)],
  ])('accepts shorthand for "%s" operator', (operator, operands, expected) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const compoundConditionShorthands: Record<string, any> = {
      and: CompoundCondition.and,
      or: CompoundCondition.or,
      not: CompoundCondition.not,
    };
    const compoundCondition = compoundConditionShorthands[operator](operands);

    expect(compoundCondition.toObj()).toEqual({
      conditionType: CompoundConditionType,
      operator,
      operands: expected,
    });
  });

  it('infers condition type from constructor', () => {
    const condition = new CompoundCondition({
      operator: 'and',
      operands: [testContractConditionObj, testTimeConditionObj],
    });
    expect(condition.value.conditionType).toEqual(CompoundConditionType);
  });

  it('rejects invalid operator', () => {
    const badObj = {
      operator: 'invalid-operator',
      operands: [testContractConditionObj, testTimeConditionObj],
    };
    expect(() => new CompoundCondition(badObj)).toThrow();
  });

  it.each(['or', 'and', 'not'])(
    'rejects empty operands for "%s" operator',
    (operator) => {
      const badObj = {
        operator,
        operands: [],
      };
      expect(() => new CompoundCondition(badObj)).toThrow();
    },
  );

  it.each(['or', 'and', 'not'])(
    'rejects non-array operands for "%s" operator',
    (operator) => {
      const badObj = {
        operator,
        operands: testContractConditionObj,
      };
      expect(() => new CompoundCondition(badObj)).toThrow();
    },
  );

  it('rejects array operands with non-one length for "not" operator', () => {
    const badObj = {
      operator: 'not',
      operands: [testContractConditionObj, testTimeConditionObj],
    };
    expect(() => new CompoundCondition(badObj)).toThrow();
  });

  it.each(['or', 'and'])(
    'accepts array operands for "%s" operator',
    (operator) => {
      const obj = {
        operator,
        operands: [testContractConditionObj, testTimeConditionObj],
      };
      expect(new CompoundCondition(obj).toObj()).toEqual({
        conditionType: CompoundConditionType,
        ...obj,
      });
    },
  );

  it.each(['or', 'and'])(
    'rejects array operands with non-greater-than-one length for "%s" operator',
    (operator) => {
      const badObj = {
        operator,
        operands: [testContractConditionObj],
      };
      expect(() => new CompoundCondition(badObj)).toThrow();
    },
  );
});
