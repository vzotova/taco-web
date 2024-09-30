import { z } from 'zod';

import { contractConditionSchema } from './base/contract';
import { rpcConditionSchema } from './base/rpc';
import { timeConditionSchema } from './base/time';
import { baseConditionSchema, Condition, ConditionProps } from './condition';
import { maxNestedDepth } from './multi-condition';
import { sequentialConditionSchema } from './sequential';
import { OmitConditionType } from './shared';

export const CompoundConditionType = 'compound';

export const compoundConditionSchema: z.ZodSchema = baseConditionSchema
  .extend({
    conditionType: z
      .literal(CompoundConditionType)
      .default(CompoundConditionType),
    operator: z.enum(['and', 'or', 'not']),
    operands: z
      .array(
        z.lazy(() =>
          z.union([
            rpcConditionSchema,
            timeConditionSchema,
            contractConditionSchema,
            compoundConditionSchema,
            sequentialConditionSchema,
          ]),
        ),
      )
      .min(1)
      .max(5),
  })
  .refine(
    (condition) => {
      // 'and' and 'or' operators must have at least 2 operands
      if (['and', 'or'].includes(condition.operator)) {
        return condition.operands.length >= 2;
      }

      // 'not' operator must have exactly 1 operand
      if (condition.operator === 'not') {
        return condition.operands.length === 1;
      }

      // We test positive cases exhaustively, so we return false here:
      return false;
    },
    ({ operands, operator }) => ({
      message: `Invalid number of operands ${operands.length} for operator "${operator}"`,
      path: ['operands'],
    }),
  )
  .refine(
    (condition) => maxNestedDepth(2)(condition),
    {
      message: 'Exceeded max nested depth of 2 for multi-condition type',
      path: ['operands'],
    }, // Max nested depth of 2
  );

export type CompoundConditionProps = z.infer<typeof compoundConditionSchema>;

export type ConditionOrProps = Condition | ConditionProps;

export class CompoundCondition extends Condition {
  constructor(value: OmitConditionType<CompoundConditionProps>) {
    super(compoundConditionSchema, {
      conditionType: CompoundConditionType,
      ...value,
    });
  }

  private static withOperator(
    operands: ConditionOrProps[],
    operator: 'or' | 'and' | 'not',
  ): CompoundCondition {
    const asObjects = operands.map((operand) => {
      if (operand instanceof Condition) {
        return operand.toObj();
      }
      return operand;
    });
    return new CompoundCondition({
      operator,
      operands: asObjects,
    });
  }

  public static or(conditions: ConditionOrProps[]): CompoundCondition {
    return CompoundCondition.withOperator(conditions, 'or');
  }

  public static and(conditions: ConditionOrProps[]): CompoundCondition {
    return CompoundCondition.withOperator(conditions, 'and');
  }

  public static not(condition: ConditionOrProps): CompoundCondition {
    return CompoundCondition.withOperator([condition], 'not');
  }
}
