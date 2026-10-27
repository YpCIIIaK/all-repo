import { Args, Context, Field, Int, Mutation, ObjectType, Query, Resolver } from '@nestjs/graphql';
import type { Request } from 'express';
import { VotingService } from './voting.service';

@ObjectType()
class CodeRequest {
  @Field() ok!: boolean;
  @Field(() => Int, { description: 'Через сколько секунд можно запросить код повторно' }) resendAfterSec!: number;
}

@ObjectType()
class Session {
  @Field({ description: 'Передавайте в заголовке Authorization: Bearer <token>' }) token!: string;
}

@ObjectType()
class VoteResult {
  @Field() accepted!: boolean;
  @Field({ description: 'true — голос этого человека уже был учтён раньше, второй не засчитан' }) alreadyVoted!: boolean;
}

@ObjectType()
class CandidateVotes {
  @Field(() => Int) candidateId!: number;
  @Field(() => Int) votes!: number;
}

@ObjectType()
class Results {
  @Field(() => Int) total!: number;
  @Field(() => [CandidateVotes]) candidates!: CandidateVotes[];
  @Field() updatedAt!: string;
}

@Resolver()
export class VotingResolver {
  constructor(private readonly voting: VotingService) {}

  @Mutation(() => CodeRequest, { description: 'Отправить код по СМС (асинхронно, через очередь)' })
  async requestCode(@Args('phone') phone: string): Promise<CodeRequest> {
    const { resendAfterSec } = await this.voting.requestCode(phone);
    return { ok: true, resendAfterSec };
  }

  @Mutation(() => Session, { description: 'Подтвердить номер кодом из СМС' })
  verifyCode(@Args('phone') phone: string, @Args('code') code: string): Promise<Session> {
    return this.voting.verifyCode(phone, code);
  }

  @Mutation(() => VoteResult, { description: 'Проголосовать (только с подтверждённым номером)' })
  async castVote(
    @Args('candidateId', { type: () => Int }) candidateId: number,
    @Context('req') req: Request,
  ): Promise<VoteResult> {
    const { alreadyVoted } = await this.voting.castVote(req.headers.authorization, candidateId);
    return { accepted: true, alreadyVoted };
  }

  @Query(() => Results)
  results(): Promise<Results> {
    return this.voting.results();
  }
}
