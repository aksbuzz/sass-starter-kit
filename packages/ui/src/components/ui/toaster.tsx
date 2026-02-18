'use client'

import * as React from 'react'
import {
  Toast, ToastClose, ToastDescription, ToastProvider, ToastTitle, ToastViewport, useToast,
  type ToasterToast,
} from './toast'

export function Toaster() {
  const { toasts } = useToast()
  return (
    <ToastProvider>
      {toasts.map(({ id, title, description, action, ...props }: ToasterToast) => (
        <Toast key={id} {...props}>
          <div className="grid gap-1">
            {title       && <ToastTitle>{title}</ToastTitle>}
            {description && <ToastDescription>{description}</ToastDescription>}
          </div>
          {action}
          <ToastClose />
        </Toast>
      ))}
      <ToastViewport />
    </ToastProvider>
  )
}
