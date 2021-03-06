import { Injectable } from '@angular/core';
import { Observable, of, forkJoin } from 'rxjs';
import { map, mergeMap, catchError } from 'rxjs/operators';
import * as _ from 'lodash';

import { ApiService } from './api';
import { CommentPeriodService } from './commentperiod.service';
import { DocumentService } from './document.service';
import { Comment } from 'app/models/comment';

interface IGetParameters {
  getDocuments?: boolean;
}

@Injectable()
export class CommentService {
  readonly accepted = 'Accepted';
  readonly pending = 'Pending';
  readonly rejected = 'Rejected';

  constructor(
    private api: ApiService,
    private commentPeriodService: CommentPeriodService,
    private documentService: DocumentService
  ) {}

  // get count of comments for the specified comment period id
  getCountByPeriodId(periodId: string): Observable<number> {
    return this.api.getCountCommentsByCommentPeriodId(periodId).pipe(catchError(error => this.api.handleError(error)));
  }

  // get all comments for the specified application id
  // (including documents)
  getAllByApplicationId(
    appId: string,
    pageNum: number = 0,
    pageSize: number = 10,
    sortBy: string = null,
    params: IGetParameters = null
  ): Observable<Comment[]> {
    // first get the comment periods
    return this.commentPeriodService.getAllByApplicationId(appId).pipe(
      mergeMap(periods => {
        if (periods && periods.length > 0) {
          // get comments for first comment period only
          // multiple comment periods are currently not supported
          return this.getAllByPeriodId(periods[0]._id, pageNum, pageSize, sortBy, params);
        }
        return of([] as Comment[]);
      }),
      catchError(error => this.api.handleError(error))
    );
  }

  // get all comments for the specified comment period id
  // (including documents)
  getAllByPeriodId(
    periodId: string,
    pageNum: number = 0,
    pageSize: number = 10,
    sortBy: string = null,
    params: IGetParameters = null
  ): Observable<Comment[]> {
    // first get just the comments
    return this.api.getCommentsByCommentPeriodId(periodId, pageNum, pageSize, sortBy).pipe(
      map(res => {
        if (res && res.length > 0) {
          const comments: Comment[] = [];
          res.forEach(comment => {
            comments.push(new Comment(comment));
          });
          return comments;
        }
        return [];
      }),
      mergeMap(comments => {
        // now get the documents for each comment
        if (params && params.getDocuments) {
          const observables: Array<Observable<Comment>> = [];
          comments.forEach(comment => {
            observables.push(
              this.documentService.getAllByCommentId(comment._id).pipe(
                map(documents => {
                  documents.forEach(doc => {
                    comment.documents.push(doc);
                  });
                  return comment;
                })
              )
            );
          });
          return forkJoin(observables);
        }

        return of(comments);
      }),
      catchError(error => this.api.handleError(error))
    );
  }

  // get a specific comment by its id
  // (including documents)
  getById(commentId: string, params: IGetParameters = null): Observable<Comment> {
    // first get the comment data
    return this.api.getComment(commentId).pipe(
      mergeMap(comments => {
        if (comments && comments.length > 0) {
          // return the first (only) comment
          const comment = new Comment(comments[0]);

          // now get the documents for this comment
          if (params && params.getDocuments) {
            return this.documentService.getAllByCommentId(comment._id).pipe(
              map(documents => {
                documents.forEach(doc => {
                  comment.documents.push(doc);
                });
                return comment;
              })
            );
          }

          return of(comment);
        }
        return of(null as Comment);
      }),
      catchError(error => this.api.handleError(error))
    );
  }

  add(orig: Comment): Observable<Comment> {
    // make a (deep) copy of the passed-in comment so we don't change it
    const comment = _.cloneDeep(orig);

    // ID must not exist on POST
    delete comment._id;

    // don't send documents
    delete comment.documents;

    // replace newlines with \\n (JSON format)
    if (comment.comment) {
      comment.comment = comment.comment.replace(/\n/g, '\\n');
    }
    if (comment.review && comment.review.reviewerNotes) {
      comment.review.reviewerNotes = comment.review.reviewerNotes.replace(/\n/g, '\\n');
    }

    return this.api.addComment(comment).pipe(catchError(error => this.api.handleError(error)));
  }

  save(orig: Comment): Observable<Comment> {
    // make a (deep) copy of the passed-in comment so we don't change it
    const comment = _.cloneDeep(orig);

    // don't send documents
    delete comment.documents;

    // replace newlines with \\n (JSON format)
    if (comment.comment) {
      comment.comment = comment.comment.replace(/\n/g, '\\n');
    }
    if (comment.review && comment.review.reviewerNotes) {
      comment.review.reviewerNotes = comment.review.reviewerNotes.replace(/\n/g, '\\n');
    }

    return this.api.saveComment(comment).pipe(catchError(error => this.api.handleError(error)));
  }

  publish(comment: Comment): Observable<Comment> {
    return this.api.publishComment(comment).pipe(catchError(error => this.api.handleError(error)));
  }

  unPublish(comment: Comment): Observable<Comment> {
    return this.api.unPublishComment(comment).pipe(catchError(error => this.api.handleError(error)));
  }

  isAccepted(comment: Comment): boolean {
    return comment && comment.commentStatus && comment.commentStatus.toLowerCase() === this.accepted.toLowerCase();
  }

  isPending(comment: Comment): boolean {
    return comment && comment.commentStatus && comment.commentStatus.toLowerCase() === this.pending.toLowerCase();
  }

  isRejected(comment: Comment): boolean {
    return comment && comment.commentStatus && comment.commentStatus.toLowerCase() === this.rejected.toLowerCase();
  }

  doAccept(comment: Comment): Comment {
    comment.commentStatus = this.accepted;
    return comment;
  }

  doPending(comment: Comment): Comment {
    comment.commentStatus = this.pending;
    return comment;
  }

  doReject(comment: Comment): Comment {
    comment.commentStatus = this.rejected;
    return comment;
  }
}
