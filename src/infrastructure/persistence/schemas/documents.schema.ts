import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Schemas } from "./schemas";
import { Types, HydratedDocument } from "mongoose";
import * as mongoose from 'mongoose';

export class DocumentsSchema {
    @Prop({
        type: String,
        required: true,
    })
    name: string;

    @Prop({
        type: String,
        required: true,
    })
    type: string;

    @Prop({
        type: String,
        required: true,
    })
    path: string;

    @Prop({
        type: Types.ObjectId,
        required: true,
        ref: Schemas.UsersSchema,
    })
    createdBy: Types.ObjectId;

    @Prop({
        type: mongoose.Schema.Types.Mixed,
        default: {},
    })
    ocrJSON: mongoose.Schema.Types.Mixed;

    @Prop({
        type: mongoose.Schema.Types.Mixed,
        default: {},
    })
    ocrText: mongoose.Schema.Types.Mixed;
}

export const documentsSchema = SchemaFactory.createForClass(DocumentsSchema);

export type DocumentsDocument = HydratedDocument<DocumentsSchema>;

